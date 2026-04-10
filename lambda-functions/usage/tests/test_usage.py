import json
import os
import sys
import unittest
from decimal import Decimal
from unittest.mock import patch

os.environ.setdefault("USAGE_TABLE", "test-folio-usage")
os.environ.setdefault("REGION_NAME", "us-west-2")
os.environ.setdefault("ALLOWED_ORIGINS", "http://localhost:3000")

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import index  # noqa: E402


def make_event(user_id="user-123"):
    return {
        "httpMethod": "GET",
        "requestContext": {
            "authorizer": {"claims": {"sub": user_id, "custom:role": "free"}}
        },
        "headers": {"origin": "http://localhost:3000"},
    }


def make_usage_item():
    return {
        "user_id": "user-123",
        "month_key": "2026-04",
        "ingestion_tokens": Decimal("80000"),
        "chat_tokens": Decimal("25000"),
        "docs_uploaded": Decimal("3"),
        "chat_day_2026-04-02": Decimal("5"),
    }


class TestLambdaHandler(unittest.TestCase):

    @patch("index.usage_table")
    def test_returns_usage_for_current_month(self, mock_table):
        mock_table.get_item.return_value = {"Item": make_usage_item()}
        resp = index.lambda_handler(make_event(), {})
        self.assertEqual(resp["statusCode"], 200)
        body = json.loads(resp["body"])
        self.assertEqual(body["ingestion_tokens"], 80000)
        self.assertEqual(body["chat_tokens"], 25000)
        self.assertEqual(body["total_tokens"], 105000)
        self.assertEqual(body["monthly_limit"], 3000000)
        self.assertEqual(body["docs_used"], 3)
        self.assertEqual(body["docs_limit"], 20)
        self.assertEqual(body["daily_chat_limit"], 50)
        self.assertIn("reset_date", body)
        self.assertIn("role", body)

    @patch("index.usage_table")
    def test_returns_zeros_when_no_usage_record(self, mock_table):
        mock_table.get_item.return_value = {}
        resp = index.lambda_handler(make_event(), {})
        self.assertEqual(resp["statusCode"], 200)
        body = json.loads(resp["body"])
        self.assertEqual(body["total_tokens"], 0)
        self.assertEqual(body["docs_used"], 0)

    def test_returns_401_when_no_user(self):
        event = make_event()
        event["requestContext"]["authorizer"]["claims"]["sub"] = ""
        resp = index.lambda_handler(event, {})
        self.assertEqual(resp["statusCode"], 401)

    @patch("index.usage_table")
    def test_admin_role_returned(self, mock_table):
        mock_table.get_item.return_value = {"Item": make_usage_item()}
        event = make_event()
        event["requestContext"]["authorizer"]["claims"]["custom:role"] = "admin"
        resp = index.lambda_handler(event, {})
        body = json.loads(resp["body"])
        self.assertEqual(body["role"], "admin")


if __name__ == "__main__":
    unittest.main()
