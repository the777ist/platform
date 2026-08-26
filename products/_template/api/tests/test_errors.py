"""RFC 9457 problem+json is a locked decision: "errors are RFC 9457 problem+json, typed into
OpenAPI -> typed client".

That makes the error SHAPE part of the API contract, not a presentation detail. If a handler
started returning FastAPI's default `{"detail": ...}` with `application/json`, every product's
generated client would still compile and every happy-path test would still pass — the break
would only appear as unreadable error UX in a shipped app.

Built on a minimal FastAPI app so no database is involved.
"""

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from pydantic import BaseModel

from template_api.errors import ProblemException, register_exception_handlers

# Spelled out on purpose: the media type IS the contract, so it must not be imported from the
# code under test — a mutation of the constant would otherwise move the assertion with it.
PROBLEM_MEDIA_TYPE = "application/problem+json"


class _Body(BaseModel):
    count: int


@pytest.fixture
def client() -> TestClient:
    app = FastAPI()
    register_exception_handlers(app)

    @app.get("/problem")
    def _problem() -> None:
        raise ProblemException(status=404, title="Not Found", detail="no such item")

    @app.get("/problem-no-detail")
    def _problem_no_detail() -> None:
        raise ProblemException(status=409, title="Conflict")

    @app.get("/problem-typed")
    def _problem_typed() -> None:
        raise ProblemException(
            status=402, title="Payment Required", detail="upgrade", type_="https://errors/pay"
        )

    @app.get("/http-error")
    def _http_error() -> None:
        raise HTTPException(status_code=401, detail="Not authenticated")

    @app.post("/validated")
    def _validated(body: _Body) -> dict[str, int]:
        return {"count": body.count}

    return TestClient(app, raise_server_exceptions=False)


class TestProblemException:
    def test_renders_the_problem_media_type(self, client: TestClient) -> None:
        response = client.get("/problem")
        # The media type is how a client tells a problem from an ordinary payload.
        assert response.headers["content-type"].startswith(PROBLEM_MEDIA_TYPE)

    def test_carries_every_required_member(self, client: TestClient) -> None:
        body = client.get("/problem").json()
        assert body == {
            "type": "about:blank",
            "title": "Not Found",
            "status": 404,
            "instance": "/problem",
            "detail": "no such item",
        }

    def test_omits_detail_rather_than_sending_null(self, client: TestClient) -> None:
        # RFC 9457 members are optional; a null would force every client to null-check.
        body = client.get("/problem-no-detail").json()
        assert "detail" not in body
        assert body["status"] == 409

    def test_honours_a_custom_problem_type_uri(self, client: TestClient) -> None:
        body = client.get("/problem-typed").json()
        assert body["type"] == "https://errors/pay"
        assert body["status"] == 402

    def test_instance_points_at_the_path_that_failed(self, client: TestClient) -> None:
        assert client.get("/problem").json()["instance"] == "/problem"


class TestFrameworkErrorsAreAlsoProblems:
    def test_an_http_exception_becomes_problem_json(self, client: TestClient) -> None:
        response = client.get("/http-error")
        assert response.status_code == 401
        assert response.headers["content-type"].startswith(PROBLEM_MEDIA_TYPE)
        # Without this handler FastAPI would return {"detail": ...} as plain json —
        # a second, undocumented error shape.
        assert response.json()["title"] == "Not authenticated"

    def test_a_validation_error_becomes_problem_json_422(self, client: TestClient) -> None:
        response = client.post("/validated", json={"count": "not-an-int"})
        assert response.status_code == 422
        assert response.headers["content-type"].startswith(PROBLEM_MEDIA_TYPE)
        body = response.json()
        assert body["title"] == "Unprocessable Entity"
        assert body["status"] == 422
        # The field-level reason must survive, or a 422 is unactionable.
        assert "count" in str(body["detail"])

    def test_a_404_from_the_router_is_still_a_problem(self, client: TestClient) -> None:
        response = client.get("/nope")
        assert response.status_code == 404
        assert response.headers["content-type"].startswith(PROBLEM_MEDIA_TYPE)
