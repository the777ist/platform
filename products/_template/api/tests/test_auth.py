import datetime as dt
from collections.abc import Generator

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi import Request
from fastapi.testclient import TestClient
from pydantic import AnyHttpUrl
from sqlmodel import Session

import template_api.auth as auth_module
from template_api.auth import get_current_user
from template_api.db import get_session
from template_api.errors import ProblemException
from template_api.main import create_app
from template_api.settings import Settings, get_settings

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


def test_missing_aud_raises_401() -> None:
    # Supabase access tokens carry aud="authenticated"; a token WITHOUT the claim must be
    # rejected (PyJWT raises MissingRequiredClaimError when audience= is enforced).
    token = jwt.encode(
        {
            "sub": "user-123",
            "exp": dt.datetime.now(dt.UTC) + dt.timedelta(hours=1),
        },
        SECRET,
        algorithm="HS256",
    )
    with pytest.raises(ProblemException) as exc:
        get_current_user(_request_with(token), _hs256_settings())
    assert exc.value.status == 401


class _StubSigningKey:
    def __init__(self, key: ec.EllipticCurvePublicKey) -> None:
        self.key = key


class _StubJWKSClient:
    def __init__(self, key: ec.EllipticCurvePublicKey) -> None:
        self._key = key

    def get_signing_key_from_jwt(self, token: str) -> _StubSigningKey:
        return _StubSigningKey(self._key)


def test_jwks_es256_path_accepts_valid_token(monkeypatch: pytest.MonkeyPatch) -> None:
    # Coverage matching the LIVE local token: the current CLI signs ES256, verified via the
    # JWKS branch (Key ruling #5). The JWK set is stubbed so no network round-trip is needed.
    private_key = ec.generate_private_key(ec.SECP256R1())
    public_key = private_key.public_key()
    token = jwt.encode(
        {
            "sub": "user-es256",
            "email": "es@b.c",
            "aud": "authenticated",
            "exp": dt.datetime.now(dt.UTC) + dt.timedelta(hours=1),
        },
        private_key,
        algorithm="ES256",
    )

    def _stub_client(url: str) -> _StubJWKSClient:
        return _StubJWKSClient(public_key)

    monkeypatch.setattr(auth_module, "_jwks_client", _stub_client)
    settings = Settings(
        database_url="postgresql+psycopg://x",
        database_migration_url="postgresql+psycopg://x",
        supabase_url=AnyHttpUrl("http://localhost:54321"),
        supabase_jwt_secret=None,  # NO fallback — proves the JWKS branch did the verifying
    )  # pyright: ignore[reportCallIssue]
    user = get_current_user(_request_with(token), settings)
    assert user.id == "user-es256"
    assert user.email == "es@b.c"


# ---- /v1/me router round-trip over HTTP (real Postgres session via conftest) ----------


@pytest.fixture
def me_client(session: Session) -> Generator[TestClient]:
    # Auth is NOT overridden — the real HTTPBearer → _decode path runs; only settings are
    # pinned (HS256 secret, no JWKS URL) so the test is hermetic in CI.
    app = create_app()
    app.dependency_overrides[get_session] = lambda: session
    app.dependency_overrides[get_settings] = _hs256_settings
    yield TestClient(app)
    app.dependency_overrides.clear()


def test_me_round_trip_returns_user_id(me_client: TestClient) -> None:
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
    res = me_client.get("/v1/me", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200
    assert res.json() == {"id": "user-123", "email": "a@b.c"}


def test_me_bad_token_is_problem_json_401(me_client: TestClient) -> None:
    res = me_client.get("/v1/me", headers={"Authorization": "Bearer not-a-real-token"})
    assert res.status_code == 401
    assert res.headers["content-type"] == "application/problem+json"
    body = res.json()
    assert body["title"] == "Unauthorized"
    assert body["status"] == 401


def test_me_missing_header_is_401(me_client: TestClient) -> None:
    res = me_client.get("/v1/me")
    assert res.status_code == 401
    assert res.headers["content-type"] == "application/problem+json"
