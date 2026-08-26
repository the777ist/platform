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


def test_jwks_url_derivation_and_override() -> None:
    # NOTE: fields left unset would fall back to the api/.env file (pydantic-settings
    # env_file) — every auth field is passed explicitly so the test is hermetic.
    derived = Settings(
        database_url="postgresql+psycopg://x",
        database_migration_url="postgresql+psycopg://x",
        supabase_url=AnyHttpUrl("http://localhost:54321"),
        supabase_jwks_url=None,
    )  # pyright: ignore[reportCallIssue]
    assert derived.jwks_url == "http://localhost:54321/auth/v1/.well-known/jwks.json"
    overridden = Settings(
        database_url="postgresql+psycopg://x",
        database_migration_url="postgresql+psycopg://x",
        supabase_url=AnyHttpUrl("http://localhost:54321"),
        supabase_jwks_url="https://jwks.example.test/keys",
    )  # pyright: ignore[reportCallIssue]
    assert overridden.jwks_url == "https://jwks.example.test/keys"
    neither = Settings(
        database_url="postgresql+psycopg://x",
        database_migration_url="postgresql+psycopg://x",
        supabase_url=None,
        supabase_jwks_url=None,
    )  # pyright: ignore[reportCallIssue]
    assert neither.jwks_url is None


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


class TestBlankEnvLinesMeanUNSET:
    """A blank env line is the shape that silently kills auth in a stamped product.

    Every guard in the codebase asks `is not None`, and `SUPABASE_JWKS_URL=` in a .env is the
    empty STRING, not None. So the blank line passed straight through: jwks_url returned "" rather
    than deriving the endpoint from supabase_url, auth.py tried to fetch a JWK set from "", and
    every authenticated request 401'd with a confusing signature error — while the configuration
    that would have worked sat one field away.

    It was real enough to earn a CLAUDE.md gotcha telling people not to leave those lines blank.
    A stamped product's api/.env is written by hand from an example, so "do not type that" is not
    a control. The Settings validator now coerces blank to None, and these pin it.
    """

    @staticmethod
    def _settings(
        *,
        supabase_url: str | None = None,
        supabase_jwks_url: str | None = None,
        supabase_jwt_secret: str | None = None,
        supabase_service_role_key: str | None = None,
    ) -> Settings:
        # Every auth field is passed explicitly so the test is hermetic: an unset field would
        # fall back to api/.env via pydantic-settings' env_file.
        return Settings(
            database_url="postgresql+psycopg://x",
            database_migration_url="postgresql+psycopg://x",
            supabase_url=supabase_url,  # pyright: ignore[reportArgumentType]
            supabase_jwks_url=supabase_jwks_url,
            supabase_jwt_secret=supabase_jwt_secret,
            supabase_service_role_key=supabase_service_role_key,
            # reportArgumentType: supabase_url is declared AnyHttpUrl, and these tests pass a
            # plain str — including "" — on purpose. The blank-is-unset validator runs in
            # mode="before", i.e. ahead of that annotation, which is precisely the behaviour
            # under test.
        )  # pyright: ignore[reportCallIssue, reportArgumentType]

    def test_a_blank_jwks_url_still_DERIVES_from_supabase_url(self) -> None:
        # The actual bug. Blank used to win over the derivation and yield "".
        s = self._settings(supabase_url="http://localhost:54321", supabase_jwks_url="")
        assert s.supabase_jwks_url is None
        assert s.jwks_url == "http://localhost:54321/auth/v1/.well-known/jwks.json"

    def test_a_blank_jwt_secret_is_unset_rather_than_an_empty_key(self) -> None:
        # An empty HS256 key verifies nothing; treating it as configured turns a missing secret
        # into a signature failure, which reads like a bad token rather than bad config.
        assert self._settings(supabase_jwt_secret="").supabase_jwt_secret is None

    def test_whitespace_only_counts_as_blank(self) -> None:
        # `SUPABASE_JWT_SECRET= ` with a trailing space is the same mistake, harder to see.
        assert self._settings(supabase_jwt_secret="   ").supabase_jwt_secret is None
        assert self._settings(supabase_service_role_key="\t").supabase_service_role_key is None

    def test_a_blank_supabase_url_is_unset_rather_than_a_validation_crash(self) -> None:
        # AnyHttpUrl rejects "", so without the coercion a blank line stops the API booting at
        # all — loud, but a strange way to learn that an optional field was left empty.
        assert self._settings(supabase_url="").supabase_url is None
        assert self._settings(supabase_url="").jwks_url is None

    def test_real_values_are_untouched(self) -> None:
        # The coercion must not eat configuration; only blanks become None.
        s = self._settings(
            supabase_jwks_url="https://jwks.example.test/keys",
            supabase_jwt_secret="a-real-secret",
        )
        assert s.jwks_url == "https://jwks.example.test/keys"
        assert s.supabase_jwt_secret == "a-real-secret"

    def test_with_everything_blank_the_error_says_so(self) -> None:
        # No verifier configured must produce the honest message, not a signature error from an
        # empty key. This is what someone reads at 2am after a stamp.
        s = self._settings(supabase_url="", supabase_jwks_url="", supabase_jwt_secret="")
        token = jwt.encode({"sub": "u", "aud": "authenticated"}, SECRET, algorithm="HS256")
        with pytest.raises(ProblemException) as excinfo:
            auth_module._decode(token, s)  # pyright: ignore[reportPrivateUsage]
        assert excinfo.value.detail == "No verifiable token"
