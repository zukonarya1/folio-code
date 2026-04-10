import os
import sys
sys.path.insert(0, os.path.dirname(__file__))

import requests
import pytest
from reporter import Reporter


_reporter = Reporter("Smoke Test", os.environ.get("ENVIRONMENT", "dev"))

# Snapshot captured before the chat call; used in token increment tests.
_pre_chat_usage: dict = {}


def test_unauthenticated_documents_returns_401(auth_context):
    resp = requests.get(f"{auth_context.api_url}/documents")
    _reporter.record("GET /documents (no auth) → 401", resp.status_code == 401,
                     f"got {resp.status_code}")
    assert resp.status_code == 401


def test_unauthenticated_usage_returns_401(auth_context):
    resp = requests.get(f"{auth_context.api_url}/users/me/usage")
    _reporter.record("GET /users/me/usage (no auth) → 401", resp.status_code == 401,
                     f"got {resp.status_code}")
    assert resp.status_code == 401


def test_usage_returns_200(auth_context):
    resp = auth_context.session.get(f"{auth_context.api_url}/users/me/usage")
    _reporter.record("GET /users/me/usage → 200", resp.status_code == 200,
                     f"got {resp.status_code}")
    assert resp.status_code == 200


def test_usage_shape(auth_context):
    resp = auth_context.session.get(f"{auth_context.api_url}/users/me/usage")
    body = resp.json()
    required = [
        "ingestion_tokens", "chat_tokens", "total_tokens", "monthly_limit",
        "docs_used", "docs_limit", "daily_chat_today", "daily_chat_limit", "reset_date",
    ]
    missing = [f for f in required if f not in body]
    _reporter.record("Usage shape — all 9 fields present", not missing,
                     f"missing: {missing}")
    assert not missing, f"Missing fields: {missing}"


def test_usage_field_types(auth_context):
    resp = auth_context.session.get(f"{auth_context.api_url}/users/me/usage")
    body = resp.json()
    int_fields = [
        "ingestion_tokens", "chat_tokens", "total_tokens", "monthly_limit",
        "docs_used", "docs_limit", "daily_chat_today", "daily_chat_limit",
    ]
    wrong = [f for f in int_fields if not isinstance(body.get(f), int)]
    _reporter.record("Usage field types — counters are integers", not wrong,
                     f"wrong type: {wrong}")
    assert not wrong, f"Fields with wrong type: {wrong}"


def test_chat_returns_answer(auth_context):
    global _pre_chat_usage
    if not auth_context.doc_id:
        pytest.skip("SMOKE_TEST_DOC_ID not set — skipping chat test")

    # Snapshot usage before the chat call
    snap = auth_context.session.get(f"{auth_context.api_url}/users/me/usage")
    _pre_chat_usage = snap.json()

    resp = auth_context.session.post(
        f"{auth_context.api_url}/documents/{auth_context.doc_id}/conversations",
        json={"message": "What is this document about?"},
    )
    if resp.status_code == 404 and "Document not found" in resp.text:
        _pre_chat_usage = {}
        pytest.skip(f"Document {auth_context.doc_id} not found in this environment — skipping chat test")
    _reporter.record("POST chat → 200", resp.status_code == 200,
                     f"got {resp.status_code}, body={resp.text[:200]}")
    assert resp.status_code == 200

    body = resp.json()
    has_answer = bool(body.get("response", "").strip())
    _reporter.record("Chat response contains non-empty answer", has_answer,
                     f"keys={list(body.keys())}")
    assert has_answer, f"Missing or empty 'response' in response: {body}"


def test_token_increment_after_chat(auth_context):
    if not _pre_chat_usage:
        pytest.skip("Skipping — chat test did not capture pre-chat snapshot")

    resp = auth_context.session.get(f"{auth_context.api_url}/users/me/usage")
    after = resp.json()

    chat_increased = after["chat_tokens"] > _pre_chat_usage.get("chat_tokens", 0)
    _reporter.record(
        "chat_tokens incremented after message",
        chat_increased,
        f"before={_pre_chat_usage.get('chat_tokens')}, after={after['chat_tokens']}",
    )

    daily_increased = (
        after["daily_chat_today"] == _pre_chat_usage.get("daily_chat_today", 0) + 1
    )
    _reporter.record(
        "daily_chat_today incremented by 1",
        daily_increased,
        f"before={_pre_chat_usage.get('daily_chat_today')}, after={after['daily_chat_today']}",
    )

    _reporter.write_summary()

    assert chat_increased, "chat_tokens did not increase after message"
    assert daily_increased, "daily_chat_today did not increment by 1"
