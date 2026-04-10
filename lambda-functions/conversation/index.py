import json
import boto3
import logging
import os
import uuid
from datetime import datetime, timedelta
from typing import Dict, List
from decimal import Decimal

logger = logging.getLogger()
logger.setLevel(logging.INFO)

bedrock_client = boto3.client("bedrock-runtime")
s3vectors_client = boto3.client("s3vectors")
dynamodb = boto3.resource("dynamodb")

CONVERSATIONS_TABLE = os.environ.get(
    "CONVERSATIONS_TABLE", "pdf-conversation-conversations"
)
METADATA_TABLE = os.environ.get("METADATA_TABLE", "pdf-conversation-metadata")
S3_VECTORS_BUCKET = os.environ["S3_VECTORS_BUCKET"]
S3_VECTOR_INDEX_NAME = os.environ.get("S3_VECTOR_INDEX_NAME", "document-chunks-index")
HAIKU_MODEL_ID = os.environ.get(
    "HAIKU_MODEL_ID", "us.anthropic.claude-haiku-4-5-20251001-v1:0"
)
BEDROCK_MODEL_ID = os.environ.get("BEDROCK_MODEL_ID", "cohere.embed-multilingual-v3")
REGION_NAME = os.environ.get("REGION_NAME", "us-west-2")
MAX_CONVERSATION_MESSAGES = int(os.environ.get("MAX_CONVERSATION_MESSAGES", "6"))
MAX_CONTEXT_CHARS = int(os.environ.get("MAX_CONTEXT_CHARS", "15000"))
ALLOWED_ORIGINS = os.environ.get("ALLOWED_ORIGINS", "http://localhost:3000").split(",")
USAGE_TABLE = os.environ.get("USAGE_TABLE", "")
MONTHLY_TOKEN_LIMIT = 3_000_000
DAILY_CHAT_LIMIT = 50

TTL_DAYS = 90

usage_table = (
    boto3.resource("dynamodb", region_name=REGION_NAME).Table(USAGE_TABLE)
    if USAGE_TABLE
    else None
)


def get_cors_origin(event):
    origin = (event.get("headers") or {}).get("origin") or (
        event.get("headers") or {}
    ).get("Origin", "")
    return origin if origin in ALLOWED_ORIGINS else ALLOWED_ORIGINS[0]


def cors_headers(event):
    return {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": get_cors_origin(event),
        "Access-Control-Allow-Credentials": "true",
    }


def decimal_default(obj):
    if isinstance(obj, Decimal):
        return int(obj) if obj == int(obj) else float(obj)
    raise TypeError


def respond(event, status_code, body):
    return {
        "statusCode": status_code,
        "headers": cors_headers(event),
        "body": json.dumps(body, default=decimal_default),
    }


def _month_key():
    from datetime import timezone

    return datetime.now(timezone.utc).strftime("%Y-%m")


def _today_key():
    from datetime import timezone

    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def _month_ttl():
    import calendar
    from datetime import timezone

    now = datetime.now(timezone.utc)
    last_day = calendar.monthrange(now.year, now.month)[1]
    end_of_month = datetime(
        now.year, now.month, last_day, 23, 59, 59, tzinfo=timezone.utc
    )
    return int((end_of_month + timedelta(days=90)).timestamp())


def check_and_reserve_daily_chat(user_id, month_key, today):
    from botocore.exceptions import ClientError

    day_attr = f"chat_day_{today}"
    try:
        usage_table.update_item(
            Key={"user_id": user_id, "month_key": month_key},
            UpdateExpression="ADD #dk :one SET #ttl = if_not_exists(#ttl, :ttl_val)",
            ConditionExpression="attribute_not_exists(#dk) OR #dk < :limit",
            ExpressionAttributeNames={"#dk": day_attr, "#ttl": "ttl"},
            ExpressionAttributeValues={
                ":one": Decimal("1"),
                ":limit": Decimal(str(DAILY_CHAT_LIMIT)),
                ":ttl_val": Decimal(str(_month_ttl())),
            },
        )
        return None
    except ClientError as e:
        if e.response["Error"]["Code"] == "ConditionalCheckFailedException":
            return {
                "statusCode": 429,
                "headers": cors_headers({}),
                "body": json.dumps(
                    {
                        "error": "You've reached your daily chat limit (50 messages). "
                        "Your limit resets tomorrow."
                    }
                ),
            }
        raise


def check_monthly_budget(user_id, month_key):
    if not usage_table:
        return None
    response = usage_table.get_item(
        Key={"user_id": user_id, "month_key": month_key}, ConsistentRead=True
    )
    item = response.get("Item", {})
    ingestion_tokens = int(item.get("ingestion_tokens", 0))
    chat_tokens = int(item.get("chat_tokens", 0))
    if ingestion_tokens + chat_tokens >= MONTHLY_TOKEN_LIMIT:
        return {
            "statusCode": 429,
            "headers": cors_headers({}),
            "body": json.dumps(
                {
                    "error": "You've reached your monthly usage limit. "
                    "Your limit resets at the start of next month."
                }
            ),
        }
    return None


def write_chat_tokens(user_id, month_key, input_tokens, output_tokens):
    if not usage_table or not user_id:
        return
    try:
        total = input_tokens + output_tokens
        usage_table.update_item(
            Key={"user_id": user_id, "month_key": month_key},
            UpdateExpression="ADD chat_tokens :tokens SET #ttl = if_not_exists(#ttl, :ttl_val)",
            ExpressionAttributeNames={"#ttl": "ttl"},
            ExpressionAttributeValues={
                ":tokens": Decimal(str(total)),
                ":ttl_val": Decimal(str(_month_ttl())),
            },
        )
    except Exception as e:
        logger.warning(f"write_chat_tokens failed for {user_id}: {e}")


def lambda_handler(event, context):
    print(f"Event: {json.dumps(event, default=str)[:500]}")

    http_method = event.get("httpMethod", "")
    path_params = event.get("pathParameters") or {}
    document_id = path_params.get("id")
    conversation_id = path_params.get("convId")

    claims = event.get("requestContext", {}).get("authorizer", {}).get("claims", {})
    user_id = claims.get("sub")

    if not user_id:
        return respond(event, 401, {"error": "Unauthorized"})

    if not document_id:
        return respond(event, 400, {"error": "Missing document ID"})

    try:
        if http_method == "GET" and conversation_id:
            return get_conversation(event, user_id, document_id, conversation_id)
        elif http_method == "GET":
            return list_conversations(event, user_id, document_id)
        elif http_method == "POST":
            return send_message(event, user_id, document_id)
        else:
            return respond(event, 405, {"error": "Method not allowed"})
    except Exception as e:
        logger.error(f"Unhandled error: {str(e)}")
        print(f"ERROR: {type(e).__name__}: {str(e)}")
        return respond(event, 500, {"error": "Internal server error"})


def list_conversations(event, user_id: str, document_id: str):
    table = dynamodb.Table(CONVERSATIONS_TABLE)

    response = table.query(
        IndexName="DocumentConversationsIndex",
        KeyConditionExpression="document_id = :doc_id",
        ExpressionAttributeValues={":doc_id": document_id},
    )

    conversations = []
    for item in response.get("Items", []):
        if item.get("user_id") != user_id:
            continue
        conversations.append(
            {
                "conversation_id": item["conversation_id"],
                "title": item.get("title", ""),
                "created_at": item.get("created_at", ""),
                "message_count": len(item.get("messages", [])),
            }
        )

    conversations.sort(key=lambda c: c["created_at"], reverse=True)

    return respond(event, 200, {"conversations": conversations})


def get_conversation(event, user_id: str, document_id: str, conversation_id: str):
    table = dynamodb.Table(CONVERSATIONS_TABLE)

    response = table.get_item(Key={"conversation_id": conversation_id})
    item = response.get("Item")

    if not item:
        return respond(event, 404, {"error": "Conversation not found"})

    if item.get("user_id") != user_id:
        return respond(event, 403, {"error": "Forbidden"})

    if item.get("document_id") != document_id:
        return respond(event, 404, {"error": "Conversation not found"})

    return respond(event, 200, item)


def send_message(event, user_id: str, document_id: str):
    body = json.loads(event.get("body") or "{}")
    message_text = body.get("message", "").strip()
    conversation_id = body.get("conversation_id")

    if not message_text:
        return respond(event, 400, {"error": "Message is required"})

    metadata_table = dynamodb.Table(METADATA_TABLE)
    doc_response = metadata_table.get_item(Key={"document_id": document_id})
    doc_item = doc_response.get("Item")

    if not doc_item:
        return respond(event, 404, {"error": "Document not found"})

    if doc_item.get("user_id") != user_id:
        return respond(event, 403, {"error": "Forbidden"})

    claims = event.get("requestContext", {}).get("authorizer", {}).get("claims", {})
    role = claims.get("custom:role", "free")
    month_key = _month_key()
    today = _today_key()

    if role != "admin":
        budget_block = check_monthly_budget(user_id, month_key)
        if budget_block:
            return budget_block
        daily_block = check_and_reserve_daily_chat(user_id, month_key, today)
        if daily_block:
            return daily_block

    conv_table = dynamodb.Table(CONVERSATIONS_TABLE)
    now = datetime.utcnow().isoformat()
    ttl = int((datetime.utcnow() + timedelta(days=TTL_DAYS)).timestamp())
    existing_messages = []

    if conversation_id:
        conv_response = conv_table.get_item(Key={"conversation_id": conversation_id})
        conv_item = conv_response.get("Item")
        if not conv_item or conv_item.get("user_id") != user_id:
            return respond(event, 404, {"error": "Conversation not found"})
        existing_messages = conv_item.get("messages", [])
    else:
        conversation_id = str(uuid.uuid4())
        conv_table.put_item(
            Item={
                "conversation_id": conversation_id,
                "document_id": document_id,
                "user_id": user_id,
                "title": message_text[:50],
                "created_at": now,
                "updated_at": now,
                "messages": [],
                "ttl": ttl,
            }
        )

    query_embedding = generate_query_embedding(message_text)

    search_results = perform_vector_search(
        query_embedding, user_id, document_id, max_results=10
    )

    ranked_results = filter_and_rank_results(
        search_results, similarity_threshold=0.3, max_results=10
    )

    rag_context = build_rag_context(ranked_results)

    history_window = existing_messages[-MAX_CONVERSATION_MESSAGES:]

    prompt = build_conversational_prompt(rag_context, history_window, message_text)

    assistant_response, input_tokens, output_tokens = invoke_haiku(prompt)
    write_chat_tokens(user_id, month_key, input_tokens, output_tokens)

    user_msg = {"role": "user", "content": message_text, "timestamp": now}
    assistant_msg = {
        "role": "assistant",
        "content": assistant_response,
        "timestamp": datetime.utcnow().isoformat(),
    }

    all_messages = existing_messages + [user_msg, assistant_msg]

    conv_table.update_item(
        Key={"conversation_id": conversation_id},
        UpdateExpression="SET messages = :msgs, updated_at = :ts",
        ExpressionAttributeValues={
            ":msgs": all_messages,
            ":ts": assistant_msg["timestamp"],
        },
    )

    return respond(
        event,
        200,
        {
            "conversation_id": conversation_id,
            "response": assistant_response,
            "timestamp": assistant_msg["timestamp"],
        },
    )


def generate_query_embedding(query_text: str) -> List[float]:
    print(f"Generating embedding for query: '{query_text[:100]}...'")

    request_payload = {"texts": [query_text], "input_type": "search_query"}

    response = bedrock_client.invoke_model(
        body=json.dumps(request_payload), modelId=BEDROCK_MODEL_ID
    )

    result = json.loads(response["body"].read())
    embedding = result["embeddings"][0]

    if len(embedding) != 1024:
        raise ValueError(f"Unexpected embedding dimension: {len(embedding)}")

    print(f"Embedding generated: {len(embedding)} dimensions")
    return embedding


def perform_vector_search(
    query_embedding: List[float], user_id: str, document_id: str, max_results: int
) -> List[Dict]:
    print(
        f"Vector search: user={user_id}, document={document_id}, topK={min(max_results, 100)}"
    )

    search_params = {
        "vectorBucketName": S3_VECTORS_BUCKET,
        "indexName": S3_VECTOR_INDEX_NAME,
        "queryVector": {"float32": query_embedding},
        "topK": min(max_results, 100),
        "returnDistance": True,
        "returnMetadata": True,
    }

    filter_conditions = []
    if user_id:
        filter_conditions.append({"user_id": user_id})
    if document_id:
        filter_conditions.append({"document_id": document_id})

    if len(filter_conditions) == 1:
        search_params["filter"] = filter_conditions[0]
    elif len(filter_conditions) > 1:
        search_params["filter"] = {"$and": filter_conditions}

    print(f"Search params: {json.dumps(search_params, default=str)[:300]}")

    try:
        response = s3vectors_client.query_vectors(**search_params)
        results = response.get("vectors", [])
        print(f"Vector search returned {len(results)} results")
        return results
    except Exception as e:
        print(f"ERROR in perform_vector_search: {type(e).__name__}: {str(e)}")
        logger.error(f"S3 Vectors search failed: {str(e)}")
        return []


def filter_and_rank_results(
    search_results: List[Dict], similarity_threshold: float, max_results: int
) -> List[Dict]:
    filtered = []

    for result in search_results:
        similarity_score = 1 - result.get("distance", 1.0)

        if similarity_score < similarity_threshold:
            continue

        metadata = result.get("metadata", {})
        chunk_text = metadata.get("chunk_text", metadata.get("text_preview", ""))

        if len(chunk_text) < 20:
            continue

        filtered.append(
            {
                "chunk_id": result["key"],
                "similarity_score": round(similarity_score, 4),
                "document_id": metadata.get("document_id", "unknown"),
                "filename": metadata.get("filename", "unknown"),
                "chunk_index": int(metadata.get("chunk_index", 0)),
                "content_type": metadata.get("content_type", "text"),
                "pages": metadata.get("pages", "unknown"),
                "chunk_text": chunk_text,
            }
        )

    ranked = sorted(filtered, key=lambda x: x["similarity_score"], reverse=True)
    return ranked[:max_results]


def build_rag_context(search_results: List[Dict]) -> str:
    context_parts = []
    total_chars = 0

    for i, result in enumerate(search_results):
        chunk_text = result.get("chunk_text", "")
        if not chunk_text:
            continue

        chunk_with_header = f"\n--- Source {i+1}: {result.get('filename', 'Unknown')} (Page {result.get('pages', '?')}) ---\n{chunk_text}\n"

        if total_chars + len(chunk_with_header) > MAX_CONTEXT_CHARS:
            print(
                f"Context limit reached at {total_chars} chars, stopping at {i} chunks"
            )
            break

        context_parts.append(chunk_with_header)
        total_chars += len(chunk_with_header)

    print(
        f"Built RAG context: {len(context_parts)} chunks, {total_chars} total characters"
    )
    return "".join(context_parts)


def build_conversational_prompt(
    rag_context: str, history: List[Dict], new_message: str
) -> str:
    history_text = ""
    for msg in history:
        role_label = "Student" if msg["role"] == "user" else "Assistant"
        history_text += f"{role_label}: {msg['content']}\n"

    return f"""You are a helpful study assistant. A student is asking questions about their uploaded document.

Rules:
- Answer using ONLY the provided source material
- If the answer is not in the sources, say "I don't have enough information from this document to answer that"
- Be concise but thorough
- Use clear, educational language
- When referencing specific information, mention which part of the document it comes from

SOURCE MATERIAL:
{rag_context}

{history_text}
Student: {new_message}"""


def invoke_haiku(prompt: str):
    print(f"Calling Haiku model: {HAIKU_MODEL_ID}")

    request_body = {
        "anthropic_version": "bedrock-2023-05-31",
        "max_tokens": 2048,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.3,
    }

    try:
        response = bedrock_client.invoke_model(
            modelId=HAIKU_MODEL_ID, body=json.dumps(request_body)
        )
        response_body = json.loads(response["body"].read())
        generated_text = response_body["content"][0]["text"]
        usage = response_body.get("usage", {})
        input_tokens = usage.get("input_tokens", 0)
        output_tokens = usage.get("output_tokens", 0)

        print(
            f"Haiku response: {len(generated_text)} chars, input_tokens={input_tokens}, output_tokens={output_tokens}"
        )
        return generated_text, input_tokens, output_tokens
    except Exception as e:
        print(f"ERROR in invoke_haiku: model={HAIKU_MODEL_ID}, error={str(e)}")
        logger.error(f"Bedrock invocation failed: {str(e)}")
        raise
