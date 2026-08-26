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
    def _ok() -> dict[str, str]:  # pyright: ignore[reportUnusedFunction]  (registered via decorator)
        # Read back what the middleware bound, so the test sees the value the handler saw.
        bound = structlog.contextvars.get_contextvars().get("request_id")
        return {"bound": str(bound)}

    @app.get("/boom")
    def _boom() -> None:  # pyright: ignore[reportUnusedFunction]  (registered via decorator)
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


class TestTheWireContract:
    def test_the_header_NAME_is_the_one_packages_core_actually_sends(self) -> None:
        # Spelled out here rather than imported, unlike every other use of REQUEST_ID_HEADER in
        # this file. The rest of these tests send the header AND assert on it through the same
        # constant, so renaming the constant's VALUE keeps all of them green — verified: setting
        # it to "X-Correlation-Id" leaves this whole file passing.
        #
        # But the name is a CROSS-SYSTEM contract, not an internal detail. packages/core's api
        # wrapper writes the literal "X-Request-Id" (src/api.ts), so a rename here means the API
        # ignores the id the client sent, mints a fresh one, and the client -> API -> logs thread
        # this module exists to guarantee is quietly severed. Nothing else in the repo would
        # notice. The contract value belongs in the test.
        assert REQUEST_ID_HEADER == "X-Request-Id"

    def test_the_literal_header_is_honoured_end_to_end(self) -> None:
        # The same assertion made through the wire rather than through the constant: a request
        # carrying the literal header a real client sends must come back with it.
        response = _client().get("/ok", headers={"X-Request-Id": "from-a-real-client"})
        assert response.headers["X-Request-Id"] == "from-a-real-client"
        assert response.json()["bound"] == "from-a-real-client"
