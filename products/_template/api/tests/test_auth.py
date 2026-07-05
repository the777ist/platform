import datetime as dt

import jwt
import pytest
from fastapi import Request

from template_api.auth import get_current_user
from template_api.errors import ProblemException
from template_api.settings import Settings

SECRET = "local-test-secret"


def _request_with(token: str | None) -> Request:
    headers = [(b"authorization", f"Bearer {token}".encode())] if token else []
    return Request({"type": "http", "headers": headers, "path": "/v1/me"})


def _hs256_settings() -> Settings:
    # NOTE: these tests mint HS256 tokens to exercise the FALLBACK branch; they stay valid
    # but no longer mirror the live local stack (a current Supabase CLI issues ES256 → the
    # JWKS branch, exercised against the local stack in Phase 6).
    return Settings(
        database_url="postgresql+psycopg://x",
        database_migration_url="postgresql+psycopg://x",
        supabase_url=None,
        supabase_jwt_secret=SECRET,
    )  # pyright: ignore[reportCallIssue]


def test_hs256_local_fallback_accepts_valid_token() -> None:
    token = jwt.encode(
        {
            "sub": "user-123",
            "email": "a@b.c",
            "aud": "authenticated",
            "exp": dt.datetime.now(dt.UTC) + dt.timedelta(hours=1),
        },
        SECRET,
        algorithm="HS256",
    )
    user = get_current_user(_request_with(token), _hs256_settings())
    assert user.id == "user-123"


def test_missing_bearer_raises_401() -> None:
    with pytest.raises(ProblemException) as exc:
        get_current_user(_request_with(None), _hs256_settings())
    assert exc.value.status == 401


def test_bad_signature_raises_401() -> None:
    token = jwt.encode({"sub": "x", "aud": "authenticated"}, "wrong-secret", algorithm="HS256")
    with pytest.raises(ProblemException) as exc:
        get_current_user(_request_with(token), _hs256_settings())
    assert exc.value.status == 401
