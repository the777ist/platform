"""Security middleware: rate-limit bucketing, response headers, and the CORS allowlist.

Each of these fails quietly rather than loudly. A rate limiter keyed on the wrong thing still
returns 429s — just to the wrong people. A missing security header changes nothing you can see
until a browser is asked to do something it should have refused. And a CORS config that forgets
to EXPOSE X-Request-Id still lets every request through; only the ability to read the id back
disappears, which silently breaks the client half of tracing.

No database needed.
"""

import jwt
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from demo_api.security import _rate_key, install_security  # pyright: ignore[reportPrivateUsage]


def _request(headers: dict[str, str] | None = None):
    """A Starlette Request carrying just the headers _rate_key reads."""
    from starlette.requests import Request

    raw = [(k.lower().encode(), v.encode()) for k, v in (headers or {}).items()]
    return Request(
        {
            "type": "http",
            "headers": raw,
            "client": ("203.0.113.7", 1234),
            "method": "GET",
            "path": "/",
        }
    )


class TestRateLimitBucket:
    def test_authenticated_requests_bucket_per_user(self) -> None:
        token = jwt.encode({"sub": "user-1"}, "irrelevant-secret")
        assert _rate_key(_request({"Authorization": f"Bearer {token}"})) == "user:user-1"

    def test_a_refreshed_token_keeps_the_SAME_bucket(self) -> None:
        # The documented reason this keys on the `sub` claim rather than a slice of the token:
        # a refresh would otherwise hand the same user a brand-new bucket and effectively
        # disable the limit for anyone who refreshes.
        first = jwt.encode({"sub": "user-1", "exp": 1_900_000_000}, "s")
        second = jwt.encode({"sub": "user-1", "exp": 1_900_000_999}, "s")
        assert first != second
        assert _rate_key(_request({"Authorization": f"Bearer {first}"})) == _rate_key(
            _request({"Authorization": f"Bearer {second}"})
        )

    def test_different_users_get_different_buckets(self) -> None:
        a = jwt.encode({"sub": "user-a"}, "s")
        b = jwt.encode({"sub": "user-b"}, "s")
        assert _rate_key(_request({"Authorization": f"Bearer {a}"})) != _rate_key(
            _request({"Authorization": f"Bearer {b}"})
        )

    def test_anonymous_requests_bucket_per_ip(self) -> None:
        assert _rate_key(_request()).startswith("ip:")

    @pytest.mark.parametrize(
        "header",
        [
            "Bearer not-a-jwt",  # junk
            "Bearer ",  # empty
            "Basic dXNlcjpwYXNz",  # wrong scheme
        ],
    )
    def test_an_unusable_authorization_header_falls_back_to_ip(self, header: str) -> None:
        # A malformed header must not raise: this runs on every request, before auth.
        assert _rate_key(_request({"Authorization": header})).startswith("ip:")

    def test_a_token_without_sub_falls_back_to_ip(self) -> None:
        token = jwt.encode({"role": "anon"}, "s")
        assert _rate_key(_request({"Authorization": f"Bearer {token}"})).startswith("ip:")


@pytest.fixture
def client() -> TestClient:
    app = FastAPI()
    install_security(app)

    @app.get("/ok")
    def _ok() -> dict[str, bool]:  # pyright: ignore[reportUnusedFunction]  (registered via decorator)
        return {"ok": True}

    return TestClient(app)


class TestSecurityHeaders:
    @pytest.mark.parametrize(
        ("header", "value"),
        [
            ("X-Content-Type-Options", "nosniff"),
            ("X-Frame-Options", "DENY"),
            ("Referrer-Policy", "no-referrer"),
        ],
    )
    def test_sets_the_hardening_headers(self, client: TestClient, header: str, value: str) -> None:
        assert client.get("/ok").headers[header] == value

    def test_sets_hsts_with_a_long_max_age_and_subdomains(self, client: TestClient) -> None:
        hsts = client.get("/ok").headers["Strict-Transport-Security"]
        assert "includeSubDomains" in hsts
        assert "max-age=63072000" in hsts


class TestCors:
    def test_EXPOSES_the_request_id_header_to_browser_javascript(self, client: TestClient) -> None:
        response = client.get("/ok", headers={"Origin": "http://localhost:8081"})
        # Without expose_headers the browser hides X-Request-Id from JS even though it is on
        # the wire — the request still succeeds and the trace id simply becomes unreadable.
        assert "x-request-id" in response.headers.get("access-control-expose-headers", "").lower()

    def test_rejects_an_origin_that_is_not_on_the_allowlist(self, client: TestClient) -> None:
        response = client.get("/ok", headers={"Origin": "https://evil.example"})
        # CORSMiddleware simply omits the allow-origin header for a disallowed origin, which
        # is what makes the browser block the read.
        assert response.headers.get("access-control-allow-origin") != "https://evil.example"
