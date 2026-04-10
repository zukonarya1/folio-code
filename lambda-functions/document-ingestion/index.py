import hashlib
import json
import logging
import boto3
import os
import traceback
import urllib.parse
import uuid
from datetime import datetime
from decimal import Decimal

from pypdf import PdfReader

logger = logging.getLogger(__name__)

METADATA_TABLE = os.environ.get("METADATA_TABLE", "pdf-conversation-metadata")
SNS_TOPIC_ARN = os.environ.get("SNS_TOPIC_ARN")
REGION_NAME = os.environ.get("REGION_NAME", "us-west-2")
DIGESTS_BUCKET = os.environ.get("DIGESTS_BUCKET", "pdf-conversation-digests")
USAGE_TABLE = os.environ.get("USAGE_TABLE", "folio-usage")
USER_POOL_ID = os.environ.get("USER_POOL_ID", "")
MONTHLY_TOKEN_LIMIT = 3_000_000
DOC_COUNT_LIMIT = 20
# Competitor context window thresholds (chars) — tracked internally, never block ingestion.
# ChatGPT Free: ~32K tokens / 128K chars (~24K words, ~45 pages)
# Claude/Gemini Free: ~100K tokens / 400K chars (~75K words, ~130 pages)
THRESHOLD_MAINSTREAM = 128_000
THRESHOLD_PREMIUM_FREE = 400_000

s3 = boto3.client("s3", region_name=REGION_NAME)
textract = boto3.client("textract", region_name=REGION_NAME)
dynamodb = boto3.resource("dynamodb", region_name=REGION_NAME)
table = dynamodb.Table(METADATA_TABLE)
metadata_table = table
usage_table = dynamodb.Table(USAGE_TABLE)
cognito = boto3.client("cognito-idp", region_name=REGION_NAME)


def extract_user_and_document_id_from_s3_key(s3_key):
    """Extract user ID and document ID from S3 key.

    Expected format: users/{user_id}/{document_id}.pdf
    """
    if not s3_key:
        return "unknown", "unknown"

    decoded_key = urllib.parse.unquote_plus(s3_key)
    parts = decoded_key.split("/")

    if len(parts) >= 3 and parts[0] == "users":
        user_id = parts[1]
        document_id = parts[2].replace(".pdf", "")
        try:
            uuid.UUID(document_id)
        except ValueError:
            raise ValueError(
                f"S3 key does not contain a valid document UUID: {decoded_key}"
            )
    else:
        raise ValueError(f"Unexpected S3 key format: {decoded_key}")

    return user_id, document_id


def _month_key():
    from datetime import timezone

    return datetime.now(timezone.utc).strftime("%Y-%m")


def _month_ttl():
    """Unix epoch 90 days after end of current month."""
    import calendar
    from datetime import timezone, timedelta

    now = datetime.now(timezone.utc)
    last_day = calendar.monthrange(now.year, now.month)[1]
    end_of_month = datetime(
        now.year, now.month, last_day, 23, 59, 59, tzinfo=timezone.utc
    )
    return int((end_of_month + timedelta(days=90)).timestamp())


def get_user_role(user_id):
    """Look up custom:role from Cognito. Returns 'free' on any error."""
    if not USER_POOL_ID:
        return "free"
    try:
        response = cognito.list_users(
            UserPoolId=USER_POOL_ID,
            Filter=f'sub = "{user_id}"',
            Limit=1,
        )
        users = response.get("Users", [])
        if not users:
            return "free"
        attrs = {a["Name"]: a["Value"] for a in users[0].get("Attributes", [])}
        return attrs.get("custom:role", "free")
    except Exception as e:
        logger.warning(f"get_user_role failed for {user_id}: {e}")
        return "free"


def get_competitor_thresholds_exceeded(char_count):
    """
    Return the set of competitor context-window milestones this document exceeds.
    Used for internal analytics only — does not block ingestion.

    Labels use numeric strings for durability as competitor pricing changes:
    "128k_chars" — exceeds ChatGPT Free context window (~32K tokens / 128K chars)
    "400k_chars" — exceeds Claude/Gemini Free context window (~100K tokens / 400K chars)
    """
    exceeded = set()
    if char_count > THRESHOLD_MAINSTREAM:
        exceeded.add("128k_chars")
    if char_count > THRESHOLD_PREMIUM_FREE:
        exceeded.add("400k_chars")
    return exceeded


def check_limits(user_id, month_key, raw_text_hash):
    """
    Check all pre-ingestion limits. Returns a 429 response dict if any limit is exceeded,
    or None if all checks pass.
    Checks (in order): lifetime doc count, monthly token budget, duplicate.
    """
    # 1. Lifetime doc count — query metadata table
    response = metadata_table.query(
        IndexName="UserDocumentsIndex",
        KeyConditionExpression="user_id = :uid",
        ExpressionAttributeValues={":uid": user_id},
        Select="COUNT",
    )
    if response.get("Count", 0) >= DOC_COUNT_LIMIT:
        return {
            "statusCode": 429,
            "body": json.dumps(
                {
                    "error": "You've reached your document limit (20 documents). "
                    "Upgrade to upload more documents."
                }
            ),
        }

    # 2. Monthly token budget — read folio-usage
    usage_response = usage_table.get_item(
        Key={"user_id": user_id, "month_key": month_key}, ConsistentRead=True
    )
    item = usage_response.get("Item", {})
    ingestion_tokens = int(item.get("ingestion_tokens", 0))
    chat_tokens = int(item.get("chat_tokens", 0))
    if ingestion_tokens + chat_tokens >= MONTHLY_TOKEN_LIMIT:
        return {
            "statusCode": 429,
            "body": json.dumps(
                {
                    "error": "You've reached your monthly usage limit. "
                    "Your limit resets at the start of next month."
                }
            ),
        }

    # 3. Duplicate detection — SHA-256 hash in doc_hashes set
    existing_hashes = item.get("doc_hashes", set())
    if raw_text_hash in existing_hashes:
        return {
            "statusCode": 429,
            "body": json.dumps(
                {"error": "You've already uploaded this document this month."}
            ),
        }

    return None


def write_usage_on_success(user_id, month_key, raw_text_hash):
    """
    Write docs_uploaded counter and doc_hashes to folio-usage after successful ingestion.
    Does NOT write token counts — StudyBook handles that after processing.
    Swallows errors — non-critical path.
    """
    try:
        ttl_val = _month_ttl()
        usage_table.update_item(
            Key={"user_id": user_id, "month_key": month_key},
            UpdateExpression=(
                "ADD docs_uploaded :one, doc_hashes :hashes "
                "SET #ttl = if_not_exists(#ttl, :ttl_val)"
            ),
            ExpressionAttributeNames={"#ttl": "ttl"},
            ExpressionAttributeValues={
                ":one": Decimal("1"),
                ":hashes": {raw_text_hash},
                ":ttl_val": Decimal(str(ttl_val)),
            },
        )
    except Exception as e:
        logger.warning(f"write_usage_on_success failed for {user_id}: {e}")


def lambda_handler(event, context):
    local_path = None
    try:
        print(f"Processing event: {json.dumps(event, indent=2)}")

        if "Records" in event:
            s3_event = event["Records"][0]["s3"]
            bucket_name = s3_event["bucket"]["name"]
            s3_key = urllib.parse.unquote_plus(s3_event["object"]["key"])
        elif "detail" in event:
            bucket_name = event["detail"]["bucket"]["name"]
            s3_key = event["detail"]["object"]["key"]
        else:
            raise ValueError("Unsupported event format")

        print(f"Processing document: s3://{bucket_name}/{s3_key}")

        user_id, document_id = extract_user_and_document_id_from_s3_key(s3_key)

        response = table.get_item(Key={"document_id": document_id})
        item = response.get("Item")

        if item:
            original_filename = item.get("original_filename", "unknown.pdf")
        else:
            print(
                f"WARNING: No metadata found for document_id {document_id}, creating record"
            )
            original_filename = "unknown.pdf"

        print(f"Document: {document_id}, user: {user_id}, file: {original_filename}")

        local_path = f"/tmp/{document_id}.pdf"
        s3.download_file(bucket_name, s3_key, local_path)

        reader = PdfReader(local_path)
        page_texts = {}
        raw_text_parts = []
        for i, page in enumerate(reader.pages):
            page_num = i + 1
            text = page.extract_text() or ""
            page_texts[str(page_num)] = text.split("\n")
            raw_text_parts.append(f"\n--- Page {page_num} ---\n{text}")
        raw_text = "\n".join(raw_text_parts).strip()
        page_count = len(reader.pages)
        word_count = len(raw_text.split())
        char_count = len(raw_text)

        avg_chars_per_page = len(raw_text.replace("\n", "").replace(" ", "")) / max(
            page_count, 1
        )

        if avg_chars_per_page < 50:
            print(
                f"Low text quality ({avg_chars_per_page:.0f} chars/page avg), "
                f"falling back to Textract DetectDocumentText"
            )
            # Limit checks skipped for Textract path — raw_text not available synchronously
            account_id = SNS_TOPIC_ARN.split(":")[4]
            textract_response = textract.start_document_text_detection(
                DocumentLocation={"S3Object": {"Bucket": bucket_name, "Name": s3_key}},
                NotificationChannel={
                    "SNSTopicArn": SNS_TOPIC_ARN,
                    "RoleArn": f"arn:aws:iam::{account_id}:role/TextractServiceRole",
                },
                JobTag=document_id,
            )
            textract_job_id = textract_response["JobId"]
            print(f"Started Textract job: {textract_job_id}")

            table.update_item(
                Key={"document_id": document_id},
                UpdateExpression="SET #s = :status, textract_job_id = :job_id, original_s3_location = :loc, user_id = :uid, original_filename = if_not_exists(original_filename, :fname)",
                ExpressionAttributeNames={"#s": "status"},
                ExpressionAttributeValues={
                    ":status": "processing",
                    ":job_id": textract_job_id,
                    ":loc": {"bucket": bucket_name, "key": s3_key},
                    ":uid": user_id,
                    ":fname": original_filename,
                },
            )

            return {
                "statusCode": 200,
                "body": json.dumps(
                    {
                        "message": "Scanned PDF detected, falling back to Textract",
                        "document_id": document_id,
                        "extraction_method": "detect_document_text",
                        "textract_job_id": textract_job_id,
                        "status": "processing",
                    }
                ),
            }

        # PyPDF path — run limit checks before expensive processing
        raw_text_hash = hashlib.sha256(raw_text.encode()).hexdigest()
        month = _month_key()
        role = get_user_role(user_id)
        thresholds_exceeded = get_competitor_thresholds_exceeded(char_count)
        if thresholds_exceeded:
            logger.warning(
                f"Large document: {document_id} ({char_count:,} chars) exceeds "
                f"competitor thresholds: {sorted(thresholds_exceeded)}"
            )

        if role != "admin":

            limit_response = check_limits(user_id, month, raw_text_hash)
            if limit_response is not None:
                table.update_item(
                    Key={"document_id": document_id},
                    UpdateExpression="SET #s = :status",
                    ExpressionAttributeNames={"#s": "status"},
                    ExpressionAttributeValues={":status": "limit_exceeded"},
                )
                return limit_response

        extraction_method = "pypdf"
        processing_metadata = {
            "processed_at": datetime.utcnow().isoformat(),
            "page_count": page_count,
            "word_count": word_count,
            "char_count": char_count,
            "thresholds_exceeded": sorted(thresholds_exceeded),
            "line_count": 0,
            "table_count": 0,
            "form_count": 0,
        }

        digest = {
            "document_id": document_id,
            "user_id": user_id,
            "original_filename": original_filename,
            "original_s3_location": {"bucket": bucket_name, "key": s3_key},
            "extraction_method": extraction_method,
            "processing_metadata": processing_metadata,
            "raw_text": raw_text,
            "page_texts": page_texts,
            "tables": [],
            "forms": {},
        }

        output_key = f"users/{user_id}/{document_id}.json"
        s3.put_object(
            Bucket=DIGESTS_BUCKET,
            Key=output_key,
            Body=json.dumps(digest, indent=2),
            ContentType="application/json",
        )

        table.update_item(
            Key={"document_id": document_id},
            UpdateExpression="SET #s = :status, original_s3_location = :loc, user_id = :uid, original_filename = if_not_exists(original_filename, :fname), processing_metadata = :meta, completed_at = :completed",
            ExpressionAttributeNames={"#s": "status"},
            ExpressionAttributeValues={
                ":status": "completed",
                ":loc": {"bucket": bucket_name, "key": s3_key},
                ":uid": user_id,
                ":fname": original_filename,
                ":meta": processing_metadata,
                ":completed": datetime.utcnow().isoformat(),
            },
        )

        write_usage_on_success(user_id, month, raw_text_hash)

        return {
            "statusCode": 200,
            "body": json.dumps(
                {
                    "message": "Document processed successfully via PyPDF",
                    "document_id": document_id,
                    "extraction_method": extraction_method,
                    "page_count": page_count,
                    "word_count": word_count,
                    "status": "completed",
                }
            ),
        }

    except Exception as e:
        print(f"Error in document ingestion: {str(e)}")
        print(f"Full traceback: {traceback.format_exc()}")

        return {
            "statusCode": 500,
            "body": json.dumps(
                {"error": str(e), "message": "Document ingestion failed"}
            ),
        }

    finally:
        if local_path and os.path.exists(local_path):
            os.remove(local_path)
