"""Security middleware: rate-limit bucketing, response headers, and the CORS allowlist.

Each of these fails quietly rather than loudly. A rate limiter keyed on the wrong thing still
returns 429s — just to the wrong people. A missing security header changes nothing you can see
until a browser is asked to do something it should have refused. And a CORS config that forgets
to EXPOSE X-Request-Id still lets every request through; only the ability to read the id back
disappears, which silently breaks the client half of tracing.

No database needed.
"""

from collections.abc import Generator

import jwt
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from template_api.main import create_app
from template_api.security import _rate_key, install_security  # pyright: ignore[reportPrivateUsage]
from template_api.settings import Settings, get_settings


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


class TestTheLimiterActuallyLimits:
    """Nothing asserted that a 429 is ever returned.

    Every test above exercises `_rate_key` (which bucket a request lands in) and the response
    headers. None of them build an app with the limiter wired, because `install_security` does
    not install it — `create_app` does, and it has to, because the middleware ORDER matters (a
    429 short-circuited by the limiter must still pass back out through the security headers and
    CORS). So the middleware, the 429 rendering and the ordering all went unexercised.

    That is not a hypothetical gap. RateLimitMiddleware exists because slowapi's own middleware
    resolves endpoints via `route.matches(scope)`, which returns Match.NONE on current FastAPI —
    so it "silently exempted every request and default limits never fired". That bug shipped
    once, was found by hand, and nothing was left behind to notice it happening again. A rate
    limiter that never fires looks exactly like one that is never provoked.
    """

    @pytest.fixture
    def strict_client(self, monkeypatch: pytest.MonkeyPatch) -> Generator[TestClient]:
        # Three per minute rather than the real hundred, so the test provokes the limit in four
        # requests instead of a hundred and one. Each create_app() builds its OWN Limiter with
        # fresh in-memory storage, so tests cannot poison each other's buckets.
        monkeypatch.setenv("RATE_LIMIT_DEFAULT", "3/minute")
        get_settings.cache_clear()
        yield TestClient(create_app())
        get_settings.cache_clear()

    def test_the_fourth_request_over_a_3_per_minute_limit_is_refused(
        self, strict_client: TestClient
    ) -> None:
        codes = [strict_client.get("/v1/hello").status_code for _ in range(4)]
        assert codes[:3] == [200, 200, 200], f"the limit fired too early: {codes}"
        assert codes[3] == 429, f"the limiter never fired: {codes}"

    def test_the_429_is_problem_json_like_every_other_error(
        self, strict_client: TestClient
    ) -> None:
        # RFC 9457 is a locked decision, and the limiter's rejection is the one error response
        # produced by middleware rather than by an exception handler — so it is the one most
        # likely to be rendered as something else.
        for _ in range(3):
            strict_client.get("/v1/hello")
        response = strict_client.get("/v1/hello")

        assert response.status_code == 429
        assert response.headers["content-type"].startswith("application/problem+json")
        body = response.json()
        assert body["status"] == 429
        assert body["title"] == "Too Many Requests"

    def test_a_rejected_request_still_carries_the_security_headers(
        self, strict_client: TestClient
    ) -> None:
        # The documented reason for the middleware ORDER: the limiter short-circuits before the
        # route, so if it were installed outside the header middleware the 429 would come back
        # bare. Starlette's add_middleware is LIFO, which makes this easy to get backwards and
        # impossible to notice.
        for _ in range(3):
            strict_client.get("/v1/hello")
        response = strict_client.get("/v1/hello")

        assert response.status_code == 429
        assert response.headers["X-Content-Type-Options"] == "nosniff"
        assert response.headers["X-Frame-Options"] == "DENY"

    def test_two_users_do_not_share_a_bucket(self, strict_client: TestClient) -> None:
        # _rate_key's bucketing asserted through the LIMITER rather than by calling it directly:
        # one user exhausting the limit must not lock out everybody else, which is what a
        # key_func wired up incorrectly would do.
        spent = jwt.encode({"sub": "heavy-user"}, "s")
        fresh = jwt.encode({"sub": "light-user"}, "s")
        for _ in range(4):
            strict_client.get("/v1/hello", headers={"Authorization": f"Bearer {spent}"})

        assert (
            strict_client.get("/v1/hello", headers={"Authorization": f"Bearer {spent}"}).status_code
            == 429
        )
        assert (
            strict_client.get("/v1/hello", headers={"Authorization": f"Bearer {fresh}"}).status_code
            == 200
        )


class TestTheConfiguredLimit:
    def test_the_shipped_default_is_a_real_limit(self) -> None:
        # A bound is only a bound at a particular value. The tests above prove the machinery
        # fires at whatever the setting says; this pins what it actually says in production, so
        # loosening it to "100000/minute" is a deliberate edit rather than a silent one.
        get_settings.cache_clear()
        assert Settings.model_fields["rate_limit_default"].default == "100/minute"
