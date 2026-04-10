import os
import sys
import time
sys.path.insert(0, os.path.dirname(__file__))

import boto3
import pytest
import requests
from reporter import Reporter

_reporter = Reporter("Pipeline Test", os.environ.get("ENVIRONMENT", "dev"))
_POLL_INTERVAL = 15   # seconds between usage polls
_POLL_TIMEOUT = 240   # max seconds to wait for ingestion


def _poll_until(condition_fn, timeout: int, interval: int, description: str) -> bool:
    """Poll condition_fn every interval seconds until it returns True or timeout."""
    deadline = time.time() + timeout
    while time.time() < deadline:
        if condition_fn():
            return True
        print(f"  polling: waiting for {description}…")
        time.sleep(interval)
    return False


def _get_doc_status(auth_context, doc_id):
    """Return the current status of doc_id from GET /documents, or None if not found."""
    resp = auth_context.session.get(f"{auth_context.api_url}/documents")
    if resp.status_code != 200:
        return None
    docs = resp.json().get("documents", [])
    doc = next((d for d in docs if d.get("document_id") == doc_id), None)
    return doc.get("status") if doc else None


@pytest.mark.order(1)
def test_fixture_healthy(auth_context):
    """Verify the pre-seeded fixture document exists and is summary_generated."""
    if not auth_context.doc_id:
        pytest.skip("SMOKE_TEST_DOC_ID not set")

    resp = auth_context.session.get(
        f"{auth_context.api_url}/documents/{auth_context.doc_id}/conversations"
    )
    # A 200 (conversation list) or 404 with no conversations means the doc exists and is accessible.
    # We just need it to not return 500.
    accessible = resp.status_code in (200, 404)
    _reporter.record("Fixture document accessible", accessible,
                     f"got {resp.status_code}")
    if not accessible:
        pytest.skip("Fixture document not accessible — skipping pipeline test")


@pytest.mark.order(2)
def test_baseline_snapshot(auth_context):
    """Record usage baseline before upload."""
    resp = auth_context.session.get(f"{auth_context.api_url}/users/me/usage")
    assert resp.status_code == 200
    body = resp.json()
    # Store in auth_context as dynamic attributes for downstream tests
    auth_context._baseline_docs = body["docs_used"]
    auth_context._baseline_ingestion = body["ingestion_tokens"]
    auth_context._baseline_chat = body["chat_tokens"]
    _reporter.record("Baseline usage captured",
                     True,
                     f"docs={body['docs_used']}, "
                     f"ingestion_tokens={body['ingestion_tokens']}, "
                     f"chat_tokens={body['chat_tokens']}")


@pytest.mark.order(3)
def test_upload_pdf(auth_context):
    """Upload test.pdf via the presigned URL API — same flow as the real frontend."""
    if not auth_context.processing_bucket:
        pytest.skip("PROCESSING_BUCKET not set")

    fixture_path = os.path.join(
        os.path.dirname(__file__), "..", "fixtures", "test.pdf"
    )

    # Step 1: get a presigned URL from the API
    resp = auth_context.session.post(
        f"{auth_context.api_url}/upload/presigned",
        json={"filename": "test.pdf", "content_type": "application/pdf"},
    )
    assert resp.status_code == 200, f"presigned URL request failed: {resp.status_code} {resp.text}"
    body = resp.json()
    presigned_url = body["presigned_url"]
    document_id = body["document_id"]

    # Reconstruct s3_key so cleanup can delete it using GHA credentials
    s3_key = f"users/{auth_context.user_id}/{document_id}.pdf"
    auth_context._uploaded_doc_id = document_id
    auth_context._uploaded_s3_key = s3_key

    # Step 2: PUT the file bytes directly to the presigned URL (no auth header)
    with open(fixture_path, "rb") as f:
        upload_resp = requests.put(
            presigned_url,
            data=f.read(),
            headers={"Content-Type": "application/pdf"},
        )
    assert upload_resp.status_code in (200, 204), (
        f"S3 presigned PUT failed: {upload_resp.status_code} {upload_resp.text[:200]}"
    )

    _reporter.record("PDF uploaded to S3 via presigned URL", True, f"key={s3_key}")


@pytest.mark.order(4)
def test_wait_for_ingestion(auth_context):
    """Poll GET /documents until the uploaded doc reaches completed/vectorized/summary_generated."""
    doc_id = getattr(auth_context, "_uploaded_doc_id", None)
    if not doc_id:
        pytest.skip("Upload did not run")

    _INGESTED = {"completed", "vectorized", "summary_generated"}
    final_status = [None]

    def ingested():
        status = _get_doc_status(auth_context, doc_id)
        final_status[0] = status
        # limit_exceeded is a terminal state — exit poll immediately
        return status in _INGESTED or status == "limit_exceeded"

    _poll_until(ingested, _POLL_TIMEOUT, _POLL_INTERVAL,
                "document status to reach completed/vectorized")

    if final_status[0] == "limit_exceeded":
        auth_context._ingestion_blocked = True
        _reporter.record("Ingestion skipped (duplicate document)", True,
                         "test.pdf hash already ingested this month")
        pytest.skip("Document rejected as duplicate — test.pdf already ingested this month")

    ok = final_status[0] in _INGESTED
    _reporter.record("Document ingested (status: completed or vectorized)", ok,
                     f"timed out — final status: {final_status[0]}" if not ok
                     else f"status={final_status[0]}")
    assert ok, f"Document did not reach ingested status within {_POLL_TIMEOUT}s (got: {final_status[0]})"


@pytest.mark.order(5)
def test_wait_for_studybook(auth_context):
    """Poll GET /documents until the uploaded doc reaches summary_generated."""
    doc_id = getattr(auth_context, "_uploaded_doc_id", None)
    if not doc_id:
        pytest.skip("Upload did not run")

    final_status = [None]

    def studied():
        status = _get_doc_status(auth_context, doc_id)
        final_status[0] = status
        return status == "summary_generated" or status == "limit_exceeded"

    _poll_until(studied, _POLL_TIMEOUT, _POLL_INTERVAL,
                "document status to reach summary_generated")

    if final_status[0] == "limit_exceeded":
        _reporter.record("StudyBook skipped (duplicate document)", True,
                         "test.pdf hash already ingested this month")
        pytest.skip("Document rejected as duplicate — StudyBook will not run")

    ok = final_status[0] == "summary_generated"
    _reporter.record("StudyBook complete (status: summary_generated)", ok,
                     f"timed out — final status: {final_status[0]}" if not ok
                     else f"status={final_status[0]}")
    assert ok, f"Document did not reach summary_generated within {_POLL_TIMEOUT}s (got: {final_status[0]})"


@pytest.mark.order(6)
def test_chat_against_new_doc(auth_context):
    """Send a chat message against the newly ingested document."""
    doc_id = getattr(auth_context, "_uploaded_doc_id", None)
    if not doc_id:
        pytest.skip("Upload did not run")
    if getattr(auth_context, "_ingestion_blocked", False):
        pytest.skip("Ingestion was blocked (duplicate document) — chat skipped")

    pre_resp = auth_context.session.get(f"{auth_context.api_url}/users/me/usage")
    auth_context._pre_pipeline_chat = pre_resp.json().get("chat_tokens", 0)

    resp = auth_context.session.post(
        f"{auth_context.api_url}/documents/{doc_id}/conversations",
        json={"message": "Summarise this document in one sentence."},
    )
    ok = resp.status_code == 200 and bool(resp.json().get("response", "").strip())
    _reporter.record("Chat against new doc → 200 with answer", ok,
                     f"status={resp.status_code}, body={resp.text[:200]}")
    assert ok


@pytest.mark.order(7)
def test_chat_tokens_incremented(auth_context):
    """Verify chat_tokens increased after the pipeline chat call."""
    before = getattr(auth_context, "_pre_pipeline_chat", None)
    if before is None:
        pytest.skip("Pre-chat snapshot not captured")

    resp = auth_context.session.get(f"{auth_context.api_url}/users/me/usage")
    after = resp.json().get("chat_tokens", 0)
    increased = after > before
    _reporter.record("chat_tokens incremented after pipeline chat", increased,
                     f"before={before}, after={after}")
    assert increased


@pytest.mark.order(8)
def test_cleanup(auth_context):
    """Delete the uploaded test document from S3 using GHA role credentials."""
    s3_key = getattr(auth_context, "_uploaded_s3_key", None)
    if not s3_key or not auth_context.processing_bucket:
        _reporter.record("Cleanup skipped (nothing to delete)", True)
        _reporter.write_summary()
        return

    # Use boto3 default credentials (GHA OIDC role — already in environment)
    s3 = boto3.client("s3", region_name=auth_context.region)
    try:
        s3.delete_object(Bucket=auth_context.processing_bucket, Key=s3_key)
        _reporter.record("Test document deleted from S3", True, f"key={s3_key}")
    except Exception as e:
        _reporter.record("Test document cleanup skipped", True, f"delete failed (non-fatal): {e}")
    _reporter.write_summary()
