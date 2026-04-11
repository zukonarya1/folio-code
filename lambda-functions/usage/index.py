import json
import os
from datetime import datetime, timezone
from decimal import Decimal

import boto3

USAGE_TABLE = os.environ.get("USAGE_TABLE", "folio-usage")
REGION_NAME = os.environ.get("REGION_NAME", "us-west-2")
ALLOWED_ORIGINS = os.environ.get("ALLOWED_ORIGINS", "http://localhost:3000").split(",")

MONTHLY_TOKEN_LIMIT = 3_000_000
DOC_COUNT_LIMIT = 20
DAILY_CHAT_LIMIT = 50

dynamodb = boto3.resource("dynamodb", region_name=REGION_NAME)
usage_table = dynamodb.Table(USAGE_TABLE)


def _month_key():
    return datetime.now(timezone.utc).strftime("%Y-%m")


def _reset_date():
    now = datetime.now(timezone.utc)
    year, month = now.year, now.month
    next_year = year + 1 if month == 12 else year
    next_month_num = 1 if month == 12 else month + 1
    next_month = datetime(next_year, next_month_num, 1, tzinfo=timezone.utc)
    return next_month.strftime("%B %-d")


def _decimal_default(obj):
    if isinstance(obj, Decimal):
        return int(obj) if obj == int(obj) else float(obj)
    raise TypeError


def _cors_headers(event):
    origin = (event.get("headers") or {}).get("origin") or (
        event.get("headers") or {}
    ).get("Origin", "")
    return {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": (
            origin if origin in ALLOWED_ORIGINS else ALLOWED_ORIGINS[0]
        ),
        "Access-Control-Allow-Credentials": "true",
    }


def lambda_handler(event, context):
    claims = event.get("requestContext", {}).get("authorizer", {}).get("claims", {})
    user_id = claims.get("sub", "")
    role = claims.get("custom:role", "free")

    if not user_id:
        return {
            "statusCode": 401,
            "headers": _cors_headers(event),
            "body": json.dumps({"error": "Unauthorized"}),
        }

    month_key = _month_key()
    response = usage_table.get_item(Key={"user_id": user_id, "month_key": month_key})
    item = response.get("Item", {})

    ingestion_tokens = int(item.get("ingestion_tokens", 0))
    chat_tokens = int(item.get("chat_tokens", 0))
    total_tokens = ingestion_tokens + chat_tokens
    docs_used = int(item.get("docs_uploaded", 0))

    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    day_key = f"chat_day_{today}"
    daily_chat_today = int(item.get(day_key, 0))

    body = {
        "ingestion_tokens": ingestion_tokens,
        "chat_tokens": chat_tokens,
        "total_tokens": total_tokens,
        "monthly_limit": MONTHLY_TOKEN_LIMIT,
        "docs_used": docs_used,
        "docs_limit": DOC_COUNT_LIMIT,
        "daily_chat_today": daily_chat_today,
        "daily_chat_limit": DAILY_CHAT_LIMIT,
        "reset_date": _reset_date(),
        "role": role,
    }

    return {
        "statusCode": 200,
        "headers": _cors_headers(event),
        "body": json.dumps(body, default=_decimal_default),
    }
# phase4 validation trigger
