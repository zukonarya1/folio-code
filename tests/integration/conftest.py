import base64
import dataclasses
import json
import os

import boto3
import pytest
import requests


@dataclasses.dataclass
class AuthContext:
    id_token: str
    user_id: str          # Cognito sub (used as user_id in S3 keys + DynamoDB)
    api_url: str          # e.g. https://mwvq5cqsh2.execute-api.us-west-2.amazonaws.com/v1
    doc_id: str           # SMOKE_TEST_DOC_ID — pre-seeded fixture document
    session: requests.Session  # pre-configured with Authorization header
    user_pool_id: str
    processing_bucket: str
    region: str


def _decode_sub(id_token: str) -> str:
    """Extract the Cognito sub claim from an IdToken without signature verification."""
    payload = id_token.split(".")[1]
    payload += "=" * (4 - len(payload) % 4)
    claims = json.loads(base64.b64decode(payload))
    return claims["sub"]


def _require_env(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        pytest.skip(f"Required env var {name} is not set — skipping integration tests")
    return value


@pytest.fixture(scope="session")
def auth_context() -> AuthContext:
    user = _require_env("SMOKE_TEST_USER")
    password = _require_env("SMOKE_TEST_PASS")
    api_url = _require_env("API_URL").rstrip("/")
    user_pool_id = _require_env("COGNITO_USER_POOL_ID")
    client_id = _require_env("COGNITO_CLIENT_ID")
    doc_id = os.environ.get("SMOKE_TEST_DOC_ID", "")
    processing_bucket = os.environ.get("PROCESSING_BUCKET", "")
    region = os.environ.get("AWS_REGION", "us-west-2")

    cognito = boto3.client("cognito-idp", region_name=region)
    response = cognito.initiate_auth(
        AuthFlow="USER_PASSWORD_AUTH",
        ClientId=client_id,
        AuthParameters={"USERNAME": user, "PASSWORD": password},
    )
    id_token = response["AuthenticationResult"]["IdToken"]
    user_id = _decode_sub(id_token)

    session = requests.Session()
    session.headers["Authorization"] = f"Bearer {id_token}"

    return AuthContext(
        id_token=id_token,
        user_id=user_id,
        api_url=api_url,
        doc_id=doc_id,
        session=session,
        user_pool_id=user_pool_id,
        processing_bucket=processing_bucket,
        region=region,
    )
