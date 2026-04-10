import json
import os
import sys
import unittest
from decimal import Decimal
from unittest.mock import patch

os.environ.setdefault("CONVERSATIONS_TABLE", "test-conversations")
os.environ.setdefault("METADATA_TABLE", "test-metadata")
os.environ.setdefault("S3_VECTORS_BUCKET", "test-bucket")
os.environ.setdefault("S3_VECTOR_INDEX_NAME", "test-index")
os.environ.setdefault("HAIKU_MODEL_ID", "us.anthropic.claude-haiku-4-5-20251001-v1:0")
os.environ.setdefault("BEDROCK_MODEL_ID", "cohere.embed-multilingual-v3")
os.environ.setdefault("REGION_NAME", "us-west-2")
os.environ.setdefault("AWS_DEFAULT_REGION", "us-west-2")
os.environ.setdefault("ALLOWED_ORIGINS", "http://localhost:3000")
os.environ.setdefault("USAGE_TABLE", "test-folio-usage")

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import index  # noqa: E402


class TestCheckDailyChat(unittest.TestCase):

    @patch("index.usage_table")
    def test_allows_when_under_limit(self, mock_table):
        mock_table.update_item.return_value = {}
        result = index.check_and_reserve_daily_chat("user-123", "2026-04", "2026-04-02")
        self.assertIsNone(result)

    @patch("index.usage_table")
    def test_blocks_when_limit_reached(self, mock_table):
        from botocore.exceptions import ClientError

        mock_table.update_item.side_effect = ClientError(
            {"Error": {"Code": "ConditionalCheckFailedException", "Message": ""}},
            "UpdateItem",
        )
        result = index.check_and_reserve_daily_chat("user-123", "2026-04", "2026-04-02")
        self.assertIsNotNone(result)
        self.assertEqual(result["statusCode"], 429)
        self.assertIn("daily", json.loads(result["body"])["error"].lower())

    @patch("index.usage_table")
    def test_raises_on_unexpected_error(self, mock_table):
        from botocore.exceptions import ClientError

        mock_table.update_item.side_effect = ClientError(
            {
                "Error": {
                    "Code": "ProvisionedThroughputExceededException",
                    "Message": "",
                }
            },
            "UpdateItem",
        )
        with self.assertRaises(ClientError):
            index.check_and_reserve_daily_chat("user-123", "2026-04", "2026-04-02")


class TestCheckMonthlyBudget(unittest.TestCase):

    @patch("index.usage_table")
    def test_allows_when_under_budget(self, mock_table):
        mock_table.get_item.return_value = {
            "Item": {
                "ingestion_tokens": Decimal("500000"),
                "chat_tokens": Decimal("200000"),
            }
        }
        result = index.check_monthly_budget("user-123", "2026-04")
        self.assertIsNone(result)

    @patch("index.usage_table")
    def test_blocks_when_over_budget(self, mock_table):
        mock_table.get_item.return_value = {
            "Item": {
                "ingestion_tokens": Decimal("2900000"),
                "chat_tokens": Decimal("200000"),
            }
        }
        result = index.check_monthly_budget("user-123", "2026-04")
        self.assertIsNotNone(result)
        self.assertEqual(result["statusCode"], 429)
        self.assertIn("monthly", json.loads(result["body"])["error"].lower())

    @patch("index.usage_table")
    def test_allows_when_no_record(self, mock_table):
        mock_table.get_item.return_value = {}
        result = index.check_monthly_budget("user-123", "2026-04")
        self.assertIsNone(result)


class TestWriteChatTokens(unittest.TestCase):

    @patch("index.usage_table")
    def test_writes_token_counts(self, mock_table):
        index.write_chat_tokens("user-123", "2026-04", 5892, 368)
        mock_table.update_item.assert_called_once()
        call_kwargs = mock_table.update_item.call_args[1]
        values = call_kwargs["ExpressionAttributeValues"]
        self.assertEqual(values[":tokens"], Decimal("6260"))

    @patch("index.usage_table")
    def test_swallows_errors(self, mock_table):
        mock_table.update_item.side_effect = Exception("error")
        index.write_chat_tokens("user-123", "2026-04", 100, 50)  # Should not raise


if __name__ == "__main__":
    unittest.main()
