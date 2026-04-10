import json
import os
import sys
import unittest
from unittest.mock import MagicMock, patch
from botocore.exceptions import ClientError

# Bootstrap environment before module import
os.environ.setdefault("DIGESTS_BUCKET", "test-digests-bucket")
os.environ.setdefault("METADATA_TABLE", "test-metadata-table")
os.environ.setdefault("HAIKU_MODEL_ID", "us.anthropic.claude-haiku-4-5-20251001-v1:0")
os.environ.setdefault("REGION_NAME", "us-west-2")
os.environ.setdefault("CHUNK_SIZE", "2000")
os.environ.setdefault("CHUNKS_PER_GROUP", "10")
os.environ.setdefault("HAIKU_INTER_CALL_DELAY", "0")  # No delay in tests

# Add parent directory to path so we can import index
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import index  # noqa: E402


def make_throttle_error():
    """Create a botocore ThrottlingException ClientError."""
    return ClientError(
        {"Error": {"Code": "ThrottlingException", "Message": "Too many requests"}},
        "InvokeModel",
    )


def make_conditional_check_error():
    """Create a botocore ConditionalCheckFailedException ClientError."""
    return ClientError(
        {
            "Error": {
                "Code": "ConditionalCheckFailedException",
                "Message": "The conditional request failed",
            }
        },
        "UpdateItem",
    )


def make_bedrock_response(text):
    """Wrap text in a Bedrock InvokeModel response structure."""
    body_bytes = json.dumps(
        {
            "content": [{"text": text}],
            "usage": {"input_tokens": 10, "output_tokens": 5},
        }
    ).encode()
    mock_body = MagicMock()
    mock_body.read.return_value = body_bytes
    return {"body": mock_body}


class TestParseJsonWithFallback(unittest.TestCase):

    def test_valid_json_returns_parsed_dict(self):
        text = '{"title": "Inferno", "introduction": "A story.", "sections": [], "glossary": [], "sources_used": 0}'
        result = index._parse_json_with_fallback(text, "Inferno.pdf")
        self.assertEqual(result["title"], "Inferno")

    def test_json_wrapped_in_markdown_is_extracted(self):
        text = 'Here is your summary:\n```json\n{"title": "Doc", "introduction": "Intro.", "sections": [], "glossary": [], "sources_used": 0}\n```'
        result = index._parse_json_with_fallback(text, "Doc.pdf")
        self.assertEqual(result["title"], "Doc")

    def test_completely_malformed_output_raises_value_error(self):
        text = "I cannot create a JSON summary for this document."
        with self.assertRaises(ValueError) as ctx:
            index._parse_json_with_fallback(text, "Doc.pdf")
        self.assertIn("Doc.pdf", str(ctx.exception))

    def test_malformed_output_logs_raw_text(self):
        text = "This is not JSON at all."
        with self.assertLogs("root", level="ERROR") as log_ctx:
            with self.assertRaises(ValueError):
                index._parse_json_with_fallback(text, "Doc.pdf")
        self.assertTrue(any("This is not JSON" in msg for msg in log_ctx.output))


class TestInvokeHaiku(unittest.TestCase):

    @patch.object(index, "bedrock_client")
    def test_succeeds_on_first_try(self, mock_bedrock):
        mock_bedrock.invoke_model.return_value = make_bedrock_response("Hello world")
        text, in_tok, out_tok = index._invoke_haiku("Test prompt")
        self.assertEqual(text, "Hello world")
        self.assertEqual(mock_bedrock.invoke_model.call_count, 1)

    @patch("time.sleep")
    @patch.object(index, "bedrock_client")
    def test_retries_on_throttle_and_succeeds(self, mock_bedrock, mock_sleep):
        mock_bedrock.invoke_model.side_effect = [
            make_throttle_error(),
            make_throttle_error(),
            make_bedrock_response("Success after retry"),
        ]
        text, in_tok, out_tok = index._invoke_haiku("Test prompt")
        self.assertEqual(text, "Success after retry")
        self.assertEqual(mock_bedrock.invoke_model.call_count, 3)
        self.assertEqual(mock_sleep.call_count, 2)

    @patch("time.sleep")
    @patch.object(index, "bedrock_client")
    def test_raises_after_max_retries_exhausted(self, mock_bedrock, mock_sleep):
        mock_bedrock.invoke_model.side_effect = make_throttle_error()
        with self.assertRaises(ClientError) as ctx:
            index._invoke_haiku("Test prompt")
        self.assertEqual(ctx.exception.response["Error"]["Code"], "ThrottlingException")
        self.assertEqual(mock_bedrock.invoke_model.call_count, 5)
        self.assertEqual(mock_sleep.call_count, 4)

    @patch("time.sleep")
    @patch.object(index, "bedrock_client")
    def test_non_throttle_error_raises_immediately_without_retry(
        self, mock_bedrock, mock_sleep
    ):
        mock_bedrock.invoke_model.side_effect = ClientError(
            {"Error": {"Code": "ValidationException", "Message": "Bad model ID"}},
            "InvokeModel",
        )
        with self.assertRaises(ClientError) as ctx:
            index._invoke_haiku("Test prompt")
        self.assertEqual(ctx.exception.response["Error"]["Code"], "ValidationException")
        self.assertEqual(mock_bedrock.invoke_model.call_count, 1)
        mock_sleep.assert_not_called()


class TestProcessDocumentConditionalWrite(unittest.TestCase):

    def _make_digest_response(self, raw_text="Chapter 1. Once upon a time..." * 50):
        body_bytes = json.dumps({"raw_text": raw_text, "filename": "test.pdf"}).encode()
        mock_body = MagicMock()
        mock_body.read.return_value = body_bytes
        return {"Body": mock_body}

    def _make_summary_response(self):
        return make_bedrock_response(
            '{"title": "T", "introduction": "I.", "sections": [], "glossary": [], "sources_used": 0}'
        )

    @patch.object(index, "s3_client")
    @patch.object(index, "bedrock_client")
    @patch.object(index, "dynamodb")
    def test_success_write_uses_condition_expression(
        self, mock_dynamo, mock_bedrock, mock_s3
    ):
        mock_s3.get_object.return_value = self._make_digest_response()
        mock_bedrock.invoke_model.return_value = self._make_summary_response()
        mock_table = MagicMock()
        mock_dynamo.Table.return_value = mock_table

        index.process_document(
            "aaaaaaaa-0000-0000-0000-000000000001",
            "aaaaaaaa-0000-0000-0000-000000000002",
        )

        success_call = mock_table.update_item.call_args_list[0]
        self.assertIn("ConditionExpression", success_call.kwargs)

    @patch.object(index, "s3_client")
    @patch.object(index, "bedrock_client")
    @patch.object(index, "dynamodb")
    def test_conditional_check_failed_is_handled_silently(
        self, mock_dynamo, mock_bedrock, mock_s3
    ):
        """If another invocation already wrote summary_generated, we return cleanly."""
        mock_s3.get_object.return_value = self._make_digest_response()
        mock_bedrock.invoke_model.return_value = self._make_summary_response()
        mock_table = MagicMock()
        mock_table.update_item.side_effect = make_conditional_check_error()
        mock_dynamo.Table.return_value = mock_table

        # Must not raise
        index.process_document(
            "aaaaaaaa-0000-0000-0000-000000000001",
            "aaaaaaaa-0000-0000-0000-000000000002",
        )

    @patch.object(index, "s3_client")
    @patch.object(index, "bedrock_client")
    @patch.object(index, "dynamodb")
    def test_other_dynamodb_error_propagates(self, mock_dynamo, mock_bedrock, mock_s3):
        """Non-conditional DynamoDB errors must still propagate."""
        mock_s3.get_object.return_value = self._make_digest_response()
        mock_bedrock.invoke_model.return_value = self._make_summary_response()
        mock_table = MagicMock()
        mock_table.update_item.side_effect = ClientError(
            {
                "Error": {
                    "Code": "ProvisionedThroughputExceededException",
                    "Message": "",
                }
            },
            "UpdateItem",
        )
        mock_dynamo.Table.return_value = mock_table

        with self.assertRaises(ClientError):
            index.process_document(
                "aaaaaaaa-0000-0000-0000-000000000001",
                "aaaaaaaa-0000-0000-0000-000000000002",
            )


class TestInvokeHaikuMaxTokens(unittest.TestCase):

    @patch.object(index, "bedrock_client")
    def test_custom_max_tokens_passed_to_bedrock(self, mock_bedrock):
        """_invoke_haiku must accept a max_tokens parameter and pass it to Bedrock."""
        mock_bedrock.invoke_model.return_value = make_bedrock_response("ok")
        index._invoke_haiku("prompt", max_tokens=4096)
        body = json.loads(mock_bedrock.invoke_model.call_args.kwargs["body"])
        self.assertEqual(body["max_tokens"], 4096)

    @patch.object(index, "bedrock_client")
    def test_default_max_tokens_is_2000(self, mock_bedrock):
        """Default max_tokens stays at 2000 to keep map-phase calls cheap."""
        mock_bedrock.invoke_model.return_value = make_bedrock_response("ok")
        index._invoke_haiku("prompt")
        body = json.loads(mock_bedrock.invoke_model.call_args.kwargs["body"])
        self.assertEqual(body["max_tokens"], 2000)


class TestMapReduceReduceMaxTokens(unittest.TestCase):

    @patch("time.sleep")
    @patch.object(index, "bedrock_client")
    def test_reduce_call_uses_4096_max_tokens(self, mock_bedrock, mock_sleep):
        """Reduce step must use max_tokens=4096 to prevent JSON truncation on large documents."""
        summary_json = '{"title": "T", "introduction": "I.", "sections": [], "glossary": [], "sources_used": 0}'
        mock_bedrock.invoke_model.return_value = make_bedrock_response(summary_json)

        index.map_reduce_summary("Some document text for testing.", "test.pdf")

        last_call = mock_bedrock.invoke_model.call_args_list[-1]
        body = json.loads(last_call.kwargs["body"])
        self.assertEqual(body["max_tokens"], 4096)


class TestValidateIds(unittest.TestCase):

    def test_valid_uuids_pass(self):
        # Must not raise
        index._validate_ids(
            "aaaaaaaa-0000-0000-0000-000000000001",
            "bbbbbbbb-1111-1111-1111-000000000002",
        )

    def test_path_traversal_in_user_id_raises(self):
        with self.assertRaises(ValueError) as ctx:
            index._validate_ids("../admin", "aaaaaaaa-0000-0000-0000-000000000001")
        self.assertIn("user_id", str(ctx.exception))

    def test_non_uuid_document_id_raises(self):
        with self.assertRaises(ValueError) as ctx:
            index._validate_ids(
                "aaaaaaaa-0000-0000-0000-000000000001",
                "not-a-uuid",
            )
        self.assertIn("document_id", str(ctx.exception))

    def test_empty_strings_raise(self):
        with self.assertRaises(ValueError):
            index._validate_ids("", "aaaaaaaa-0000-0000-0000-000000000001")


class TestReducePromptSchema(unittest.TestCase):

    @patch("time.sleep")
    @patch.object(index, "_invoke_haiku")
    def test_reduce_prompt_uses_label_not_heading(self, mock_haiku, mock_sleep):
        """Reduce prompt must instruct Haiku to output 'label' so SummaryRenderer renders section titles."""
        mock_haiku.return_value = (
            '{"title": "T", "introduction": "I.", '
            '"sections": [], "glossary": [], "sources_used": 0}',
            10,
            5,
        )
        index.map_reduce_summary("word " * 100, "test.pdf")
        reduce_prompt = mock_haiku.call_args_list[-1].args[0]
        self.assertIn('"label"', reduce_prompt)
        self.assertNotIn('"heading"', reduce_prompt)

    @patch("time.sleep")
    @patch.object(index, "_invoke_haiku")
    def test_reduce_prompt_contains_items_array(self, mock_haiku, mock_sleep):
        """Reduce prompt must include 'items' so sections produce bullet points."""
        mock_haiku.return_value = (
            '{"title": "T", "introduction": "I.", '
            '"sections": [], "glossary": [], "sources_used": 0}',
            10,
            5,
        )
        index.map_reduce_summary("word " * 100, "test.pdf")
        reduce_prompt = mock_haiku.call_args_list[-1].args[0]
        self.assertIn('"items"', reduce_prompt)

    @patch("time.sleep")
    @patch.object(index, "_invoke_haiku")
    def test_map_reduce_sources_used_equals_chunk_count(self, mock_haiku, mock_sleep):
        """sources_used must equal actual chunk count, overriding whatever Haiku returns."""
        # 3001 chars at CHUNK_SIZE=2000 = 2 chunks
        mock_haiku.return_value = (
            '{"title": "T", "introduction": "I.", '
            '"sections": [], "glossary": [], "sources_used": 99}',
            10,
            5,
        )
        result, _ = index.map_reduce_summary("a" * 3001, "test.pdf")
        self.assertEqual(result["sources_used"], 2)
