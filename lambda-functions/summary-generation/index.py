import json
import os
import re
import boto3
import time
import logging
from botocore.config import Config

logger = logging.getLogger()
logger.setLevel(logging.INFO)

DIGESTS_BUCKET = os.environ["DIGESTS_BUCKET"]
METADATA_TABLE = os.environ["METADATA_TABLE"]
HAIKU_MODEL_ID = os.environ["HAIKU_MODEL_ID"]
CHUNK_SIZE = int(os.environ.get("CHUNK_SIZE", "2000"))
CHUNKS_PER_GROUP = int(os.environ.get("CHUNKS_PER_GROUP", "10"))
HAIKU_INTER_CALL_DELAY = float(os.environ.get("HAIKU_INTER_CALL_DELAY", "0.5"))
REGION_NAME = os.environ["REGION_NAME"]
USAGE_TABLE = os.environ.get("USAGE_TABLE", "")

_S3_TIMEOUT = Config(connect_timeout=5, read_timeout=30)
s3_client = boto3.client("s3", region_name=REGION_NAME, config=_S3_TIMEOUT)
bedrock_client = boto3.client("bedrock-runtime", region_name=REGION_NAME)
dynamodb = boto3.resource("dynamodb", region_name=REGION_NAME)
usage_table = (
    boto3.resource("dynamodb", region_name=REGION_NAME).Table(USAGE_TABLE)
    if USAGE_TABLE
    else None
)

_UUID_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")


def lambda_handler(event, context):
    records = event.get("Records", [])
    if not records:
        # Direct invoke path for admin/recovery — e.g., manual prod recovery
        document_id = event["document_id"]
        user_id = event["user_id"]
        logger.info(f"Direct invoke: document_id={document_id}")
        process_document(document_id, user_id)
        return {"statusCode": 200, "body": "OK"}

    for record in records:
        # SQS record — body is SNS notification envelope (rawMessageDelivery=False)
        body = json.loads(record["body"])
        sns_message = json.loads(body["Message"])
        document_id = sns_message["document_id"]
        user_id = sns_message["user_id"]
        logger.info(f"SQS invoke: document_id={document_id}")
        process_document(document_id, user_id)


def _validate_ids(user_id, document_id):
    if not _UUID_RE.match(user_id or ""):
        raise ValueError(f"Invalid user_id format: {user_id!r}")
    if not _UUID_RE.match(document_id or ""):
        raise ValueError(f"Invalid document_id format: {document_id!r}")


def process_document(document_id, user_id):
    _validate_ids(user_id, document_id)
    from botocore.exceptions import ClientError

    table = dynamodb.Table(METADATA_TABLE)

    try:
        # Read digest from S3 — contains full raw_text, no vector search needed
        digest_key = f"users/{user_id}/{document_id}.json"
        response = s3_client.get_object(Bucket=DIGESTS_BUCKET, Key=digest_key)
        digest = json.loads(response["Body"].read())
        raw_text = digest.get("raw_text", "")
        filename = digest.get("filename", "document")

        if not raw_text:
            raise ValueError(f"Empty raw_text in digest for {document_id}")

        logger.info(f"Digest read: {len(raw_text)} chars, file={filename}")

        summary, total_tokens = map_reduce_summary(raw_text, filename)

        # Conditional write — only update if status is vectorized or summary_error.
        # Prevents a racing second invocation from overwriting a valid summary_generated.
        try:
            table.update_item(
                Key={"document_id": document_id},
                UpdateExpression="SET #s = :s, generated_summary = :summary",
                ConditionExpression="(#s IN (:vectorized, :summary_error)) OR attribute_not_exists(#s)",
                ExpressionAttributeNames={"#s": "status"},
                ExpressionAttributeValues={
                    ":s": "summary_generated",
                    ":summary": summary,
                    ":vectorized": "vectorized",
                    ":summary_error": "summary_error",
                },
            )
        except ClientError as e:
            if e.response["Error"]["Code"] == "ConditionalCheckFailedException":
                logger.info(
                    f"Race condition detected for {document_id} — another invocation "
                    f"already wrote summary_generated, skipping"
                )
                return
            raise

        logger.info(f"Summary stored for {document_id}")
        write_ingestion_tokens(user_id, total_tokens)

    except Exception as e:
        logger.error(f"Summary failed for {document_id}: {e}")
        table.update_item(
            Key={"document_id": document_id},
            UpdateExpression="SET #s = :s",
            ExpressionAttributeNames={"#s": "status"},
            ExpressionAttributeValues={":s": "summary_error"},
        )
        raise


def map_reduce_summary(raw_text, filename):
    # Chunk full document text
    chunks = [raw_text[i : i + CHUNK_SIZE] for i in range(0, len(raw_text), CHUNK_SIZE)]
    groups = [
        chunks[i : i + CHUNKS_PER_GROUP]
        for i in range(0, len(chunks), CHUNKS_PER_GROUP)
    ]
    logger.info(f"Map-reduce: {len(chunks)} chunks, {len(groups)} groups")

    total_input_tokens = 0
    total_output_tokens = 0

    # MAP phase — one Haiku call per group
    sub_summaries = []
    for i, group in enumerate(groups):
        combined = "\n\n".join(group)
        prompt = (
            f'You are summarizing part {i + 1} of {len(groups)} of a document called "{filename}".\n\n'
            f"Summarize the key concepts, facts, and ideas from this section in 3-5 bullet points:\n\n"
            f"{combined}"
        )
        sub_text, in_tok, out_tok = _invoke_haiku(prompt)
        sub_summaries.append(sub_text)
        total_input_tokens += in_tok
        total_output_tokens += out_tok
        if i < len(groups) - 1:
            time.sleep(HAIKU_INTER_CALL_DELAY)

    # REDUCE phase — one Haiku call over all sub-summaries
    combined_summaries = "\n\n".join(
        [f"Section {i + 1}:\n{s}" for i, s in enumerate(sub_summaries)]
    )
    reduce_prompt = (
        f"You are an educational content designer specializing in student study materials. "
        f'Your task is to transform source material from a document called "{filename}" '
        f"into a structured study summary for a university-level student who wants to understand "
        f"the document's key concepts without reading every page.\n\n"
        f"The student will use this summary to: build a mental model of the document, "
        f"identify key vocabulary, and review before a test or discussion. "
        f"Write at a level appropriate for an intelligent reader with no assumed prior domain knowledge.\n\n"
        f"Structure your output using the following JSON schema. "
        f"Return ONLY valid JSON — no markdown fences, no preamble, no trailing text.\n\n"
        f"{{\n"
        f'    "title": "Specific, descriptive title naming the subject matter (not \'Summary of Document\')",\n'
        f'    "introduction": "2-4 sentences: what this document is about, why it matters, what domain it belongs to",\n'
        f'    "sections": [\n'
        f"        {{\n"
        f'            "label": "LLM-chosen label for this document type (e.g. Learning Objectives, Key Findings, Core Arguments, Timeline, Methodology, Practical Applications, Main Characters, Notable Clauses)",\n'
        f'            "content": "optional: 2-4 sentences explaining this section\'s theme. Omit if items alone suffice.",\n'
        f'            "items": [\n'
        f'                "optional: specific, concrete bullet points drawn from the source"\n'
        f"            ]\n"
        f"        }}\n"
        f"    ],\n"
        f'    "glossary": [\n'
        f'        {{"term": "Domain-specific term only", "definition": "Plain-language definition a first-year student can understand"}}\n'
        f"    ],\n"
        f'    "sources_used": 0\n'
        f"}}\n\n"
        f"Constraints:\n"
        f"- sections: 2-5. Order foundational to advanced. "
        f"Choose labels appropriate to the document type — do not use generic labels like 'Section 1'.\n"
        f"- Label examples: textbook -> 'Learning Objectives', 'Key Concepts'; "
        f"research paper -> 'Research Question', 'Methodology', 'Key Findings'; "
        f"history -> 'Timeline', 'Key Figures'; "
        f"law -> 'Legal Obligations', 'Notable Clauses'; "
        f"fiction -> 'Main Characters', 'Themes'.\n"
        f"- Each section must have at least one of: content (paragraph) or items (bullets). Both allowed.\n"
        f"- Glossary: 3-6 entries. Domain-specific terms only.\n"
        f"- Do not invent facts. Every claim must be traceable to the source material below.\n\n"
        f"=====\n"
        f"SOURCE MATERIAL (section summaries from {len(groups)} document sections)\n"
        f"=====\n"
        f"{combined_summaries}"
    )
    result_text, in_tok, out_tok = _invoke_haiku(reduce_prompt, max_tokens=4096)
    total_input_tokens += in_tok
    total_output_tokens += out_tok
    result = _parse_json_with_fallback(result_text, filename)
    result["sources_used"] = len(chunks)
    total_tokens = total_input_tokens + total_output_tokens
    return result, total_tokens


def _month_key():
    from datetime import datetime, timezone

    return datetime.now(timezone.utc).strftime("%Y-%m")


def _month_ttl():
    from datetime import datetime, timezone, timedelta
    import calendar

    now = datetime.now(timezone.utc)
    last_day = calendar.monthrange(now.year, now.month)[1]
    end_of_month = datetime(
        now.year, now.month, last_day, 23, 59, 59, tzinfo=timezone.utc
    )
    return int((end_of_month + timedelta(days=90)).timestamp())


def write_ingestion_tokens(user_id, total_tokens):
    """Write accumulated StudyBook token usage to folio-usage. Swallows errors — non-critical."""
    if not user_id or not usage_table:
        return
    try:
        from decimal import Decimal

        month_key = _month_key()
        ttl_val = _month_ttl()
        usage_table.update_item(
            Key={"user_id": user_id, "month_key": month_key},
            UpdateExpression="ADD ingestion_tokens :tokens SET #ttl = if_not_exists(#ttl, :ttl_val)",
            ExpressionAttributeNames={"#ttl": "ttl"},
            ExpressionAttributeValues={
                ":tokens": Decimal(str(total_tokens)),
                ":ttl_val": Decimal(str(ttl_val)),
            },
        )
    except Exception as e:
        logger.warning(f"Failed to write ingestion tokens for {user_id}: {e}")


def _invoke_haiku(prompt, max_retries=5, max_tokens=2000):
    import random
    from botocore.exceptions import ClientError

    for attempt in range(max_retries):
        try:
            response = bedrock_client.invoke_model(
                modelId=HAIKU_MODEL_ID,
                contentType="application/json",
                accept="application/json",
                body=json.dumps(
                    {
                        "anthropic_version": "bedrock-2023-05-31",
                        "max_tokens": max_tokens,
                        "messages": [{"role": "user", "content": prompt}],
                    }
                ),
            )
            body = json.loads(response["body"].read())
            text = body["content"][0]["text"]
            usage = body.get("usage", {})
            in_tok = usage.get("input_tokens", 0)
            out_tok = usage.get("output_tokens", 0)
            return text, in_tok, out_tok
        except ClientError as e:
            if (
                e.response["Error"]["Code"] == "ThrottlingException"
                and attempt < max_retries - 1
            ):
                delay = (2**attempt) + random.uniform(0, 1)
                logger.warning(
                    f"Bedrock throttled (attempt {attempt + 1}/{max_retries}), "
                    f"retrying in {delay:.1f}s"
                )
                time.sleep(delay)
            else:
                raise


def _parse_json_with_fallback(text, filename):
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        # Haiku sometimes wraps JSON in prose — try to extract the JSON object
        start = text.find("{")
        end = text.rfind("}") + 1
        if start >= 0 and end > start:
            try:
                return json.loads(text[start:end])
            except json.JSONDecodeError:
                pass
    logger.error(f"JSON parse failed for {filename}. Raw output: {text[:500]}")
    raise ValueError(f"Haiku returned non-JSON output for {filename}")
