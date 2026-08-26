"""This is the API half of the X-Request-Id chain. packages/core asserts the client mints an id,
sends it, and tags Sentry with it; this asserts the API HONOURS that id, binds it to structlog and
echoes it back — which is what makes client -> API -> logs one traceable thread.

The failure is invisible in normal use: every response still succeeds, every log line still gets
written, and the ids simply never line up. You only discover it when you are trying to trace a
production incident, which is the worst possible moment.

Minimal app, no database.
"""

import re

import structlog
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

from template_api.errors import register_exception_handlers
from template_api.middleware import REQUEST_ID_HEADER, install_request_id


def _client() -> TestClient:
    app = FastAPI()

    @app.get("/ok")
    def _ok() -> dict[str, str]:
        # Read back what the middleware bound, so the test sees the value the handler saw.
        bound = structlog.contextvars.get_contextvars().get("request_id")
        return {"bound": str(bound)}

    @app.get("/boom")
    def _boom() -> None:
        raise HTTPException(status_code=500, detail="kaboom")

    register_exception_handlers(app)
    install_request_id(app)  # installed LAST => outermost, as in main.py
    return TestClient(app, raise_server_exceptions=False)


class TestInboundIdIsHonoured:
    def test_echoes_the_inbound_id_back_unchanged(self) -> None:
        response = _client().get("/ok", headers={REQUEST_ID_HEADER: "client-abc-123"})
        # Same id the core api-client generated and tagged Sentry with.
        assert response.headers[REQUEST_ID_HEADER] == "client-abc-123"

    def test_binds_the_inbound_id_for_the_log_context(self) -> None:
        response = _client().get("/ok", headers={REQUEST_ID_HEADER: "client-abc-123"})
        # Every structlog line in this request carries it; a different value here would
        # make the API logs unjoinable to the client event.
        assert response.json()["bound"] == "client-abc-123"


class TestGeneratedIdWhenAbsent:
    def test_mints_one_when_the_caller_sends_none(self) -> None:
        response = _client().get("/ok")
        minted = response.headers[REQUEST_ID_HEADER]
        assert re.fullmatch(r"[0-9a-f]{32}", minted), minted

    def test_the_minted_id_is_the_one_that_gets_bound(self) -> None:
        response = _client().get("/ok")
        assert response.json()["bound"] == response.headers[REQUEST_ID_HEADER]

    def test_each_request_gets_its_own_id(self) -> None:
        client = _client()
        first = client.get("/ok").headers[REQUEST_ID_HEADER]
        second = client.get("/ok").headers[REQUEST_ID_HEADER]
        # A shared id would collapse every request into one trace.
        assert first != second


class TestErrorResponsesToo:
    def test_a_failed_request_still_carries_the_id(self) -> None:
        # The middleware is installed OUTERMOST precisely so this holds — and an error is
        # exactly when you need the id most.
        response = _client().get("/boom", headers={REQUEST_ID_HEADER: "trace-me"})
        assert response.status_code == 500
        assert response.headers[REQUEST_ID_HEADER] == "trace-me"
