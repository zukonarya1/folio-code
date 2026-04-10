import json
import os
import sys
import unittest
from decimal import Decimal
from unittest.mock import MagicMock, patch

os.environ.setdefault("DIGESTS_BUCKET", "test-digests")
os.environ.setdefault("METADATA_TABLE", "test-metadata")
os.environ.setdefault("HAIKU_MODEL_ID", "us.anthropic.claude-haiku-4-5-20251001-v1:0")
os.environ.setdefault("CHUNK_SIZE", "2000")
os.environ.setdefault("CHUNKS_PER_GROUP", "10")
os.environ.setdefault("HAIKU_INTER_CALL_DELAY", "0")
os.environ.setdefault("REGION_NAME", "us-west-2")
os.environ.setdefault("USAGE_TABLE", "test-folio-usage")

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import index  # noqa: E402


def make_bedrock_response(text, input_tokens=100, output_tokens=50):
    """Build a mock Bedrock response body matching the actual API format."""
    body_bytes = json.dumps(
        {
            "content": [{"type": "text", "text": text}],
            "usage": {"input_tokens": input_tokens, "output_tokens": output_tokens},
        }
    ).encode()
    mock_response = MagicMock()
    mock_response["body"].read.return_value = body_bytes
    return mock_response


class TestInvokeHaikuTokens(unittest.TestCase):

    @patch("index.bedrock_client")
    def test_returns_text_and_token_counts(self, mock_bedrock):
        mock_bedrock.invoke_model.return_value = make_bedrock_response(
            "Summary text", input_tokens=500, output_tokens=200
        )
        text, in_tok, out_tok = index._invoke_haiku("test prompt")
        self.assertEqual(text, "Summary text")
        self.assertEqual(in_tok, 500)
        self.assertEqual(out_tok, 200)


class TestWriteIngestionTokens(unittest.TestCase):

    @patch("index.usage_table")
    def test_writes_tokens_to_folio_usage(self, mock_table):
        index.write_ingestion_tokens("user-123", 12500)
        mock_table.update_item.assert_called_once()
        call_kwargs = mock_table.update_item.call_args[1]
        self.assertEqual(call_kwargs["Key"]["user_id"], "user-123")
        self.assertIn(":tokens", call_kwargs["ExpressionAttributeValues"])
        self.assertEqual(
            call_kwargs["ExpressionAttributeValues"][":tokens"], Decimal("12500")
        )

    @patch("index.usage_table")
    def test_swallows_errors_silently(self, mock_table):
        mock_table.update_item.side_effect = Exception("DynamoDB error")
        # Should not raise
        index.write_ingestion_tokens("user-123", 100)


if __name__ == "__main__":
    unittest.main()
