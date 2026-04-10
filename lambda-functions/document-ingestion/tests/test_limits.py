import json
import os
import sys
import unittest
from decimal import Decimal
from unittest.mock import patch

os.environ.setdefault("METADATA_TABLE", "test-metadata")
os.environ.setdefault("SNS_TOPIC_ARN", "arn:aws:sns:us-west-2:123:test")
os.environ.setdefault("DIGESTS_BUCKET", "test-digests")
os.environ.setdefault("REGION_NAME", "us-west-2")
os.environ.setdefault("USAGE_TABLE", "test-folio-usage")
os.environ.setdefault("USER_POOL_ID", "us-west-2_test")

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import index  # noqa: E402


class TestGetCompetitorThresholdsExceeded(unittest.TestCase):

    def test_returns_empty_set_for_small_doc(self):
        result = index.get_competitor_thresholds_exceeded(50_000)
        self.assertEqual(result, set())

    def test_returns_128k_only_just_below_400k_boundary(self):
        # 399,999 exceeds 128K but not 400K — confirms upper threshold is exclusive
        result = index.get_competitor_thresholds_exceeded(399_999)
        self.assertEqual(result, {"128k_chars"})

    def test_returns_both_thresholds_for_large_doc(self):
        result = index.get_competitor_thresholds_exceeded(500_000)
        self.assertEqual(result, {"128k_chars", "400k_chars"})

    def test_returns_128k_at_exact_boundary(self):
        result = index.get_competitor_thresholds_exceeded(128_001)
        self.assertEqual(result, {"128k_chars"})

    def test_returns_empty_at_exact_128k_boundary(self):
        # 128,000 chars fits within the 128K window — strict > not >=
        result = index.get_competitor_thresholds_exceeded(128_000)
        self.assertEqual(result, set())

    def test_returns_both_above_400k_boundary(self):
        result = index.get_competitor_thresholds_exceeded(400_001)
        self.assertEqual(result, {"128k_chars", "400k_chars"})

    def test_returns_128k_only_at_exact_400k_boundary(self):
        # 400,000 chars exceeds 128K but fits within 400K — strict > not >=
        result = index.get_competitor_thresholds_exceeded(400_000)
        self.assertEqual(result, {"128k_chars"})


class TestGetUserRole(unittest.TestCase):

    @patch("index.cognito")
    def test_returns_free_by_default(self, mock_cognito):
        mock_cognito.list_users.return_value = {
            "Users": [{"Attributes": [{"Name": "custom:role", "Value": "free"}]}]
        }
        self.assertEqual(index.get_user_role("user-123"), "free")

    @patch("index.cognito")
    def test_returns_admin_when_attribute_set(self, mock_cognito):
        mock_cognito.list_users.return_value = {
            "Users": [{"Attributes": [{"Name": "custom:role", "Value": "admin"}]}]
        }
        self.assertEqual(index.get_user_role("user-123"), "admin")

    @patch("index.cognito")
    def test_returns_free_when_no_role_attribute(self, mock_cognito):
        mock_cognito.list_users.return_value = {
            "Users": [{"Attributes": [{"Name": "email", "Value": "a@b.com"}]}]
        }
        self.assertEqual(index.get_user_role("user-123"), "free")

    @patch("index.cognito")
    def test_returns_free_when_user_not_found(self, mock_cognito):
        mock_cognito.list_users.return_value = {"Users": []}
        self.assertEqual(index.get_user_role("user-123"), "free")


class TestCheckLimits(unittest.TestCase):

    def make_usage_item(self, ingestion_tokens=0, chat_tokens=0, docs=0, hashes=None):
        item = {
            "ingestion_tokens": Decimal(str(ingestion_tokens)),
            "chat_tokens": Decimal(str(chat_tokens)),
            "docs_uploaded": Decimal(str(docs)),
        }
        if hashes:
            item["doc_hashes"] = set(hashes)
        return item

    @patch("index.usage_table")
    @patch("index.metadata_table")
    def test_passes_when_under_all_limits(self, mock_meta, mock_usage):
        mock_usage.get_item.return_value = {
            "Item": self.make_usage_item(ingestion_tokens=100000, docs=2)
        }
        mock_meta.query.return_value = {"Count": 2}
        result = index.check_limits("user-123", "2026-04", raw_text_hash="abc")
        self.assertIsNone(result)

    @patch("index.usage_table")
    @patch("index.metadata_table")
    def test_blocks_when_lifetime_doc_count_reached(self, mock_meta, mock_usage):
        mock_usage.get_item.return_value = {"Item": self.make_usage_item()}
        mock_meta.query.return_value = {"Count": 20}
        result = index.check_limits("user-123", "2026-04", raw_text_hash="abc")
        self.assertIsNotNone(result)
        self.assertEqual(result["statusCode"], 429)
        self.assertIn("document limit", json.loads(result["body"])["error"].lower())

    @patch("index.usage_table")
    @patch("index.metadata_table")
    def test_blocks_when_monthly_token_budget_exceeded(self, mock_meta, mock_usage):
        mock_usage.get_item.return_value = {
            "Item": self.make_usage_item(
                ingestion_tokens=2_800_000, chat_tokens=300_000
            )
        }
        mock_meta.query.return_value = {"Count": 1}
        result = index.check_limits("user-123", "2026-04", raw_text_hash="abc")
        self.assertIsNotNone(result)
        self.assertEqual(result["statusCode"], 429)
        self.assertIn("monthly", json.loads(result["body"])["error"].lower())

    @patch("index.usage_table")
    @patch("index.metadata_table")
    def test_blocks_duplicate_document(self, mock_meta, mock_usage):
        mock_usage.get_item.return_value = {
            "Item": self.make_usage_item(hashes={"existing_hash"})
        }
        mock_meta.query.return_value = {"Count": 1}
        result = index.check_limits(
            "user-123", "2026-04", raw_text_hash="existing_hash"
        )
        self.assertIsNotNone(result)
        self.assertEqual(result["statusCode"], 429)
        self.assertIn("already uploaded", json.loads(result["body"])["error"].lower())


if __name__ == "__main__":
    unittest.main()
