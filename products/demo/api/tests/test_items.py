import base64

import pytest
from fastapi.testclient import TestClient

from tests.factories import ItemCreateFactory


def _b64(raw: str) -> str:
    return base64.urlsafe_b64encode(raw.encode()).decode()


def test_create_then_get_returns_dto(auth_client: TestClient) -> None:
    payload = ItemCreateFactory.build().model_dump()
    created = auth_client.post("/v1/items", json=payload)
    assert created.status_code == 201
    body = created.json()
    # DTO shape only — owner_id is set server-side; NO SQLModel internals leak.
    assert set(body) == {"id", "title", "description", "owner_id", "created_at", "updated_at"}
    got = auth_client.get(f"/v1/items/{body['id']}")
    assert got.status_code == 200
    assert got.json()["id"] == body["id"]


def test_list_is_cursor_paginated(auth_client: TestClient) -> None:
    for _ in range(25):
        auth_client.post("/v1/items", json=ItemCreateFactory.build().model_dump())
    first = auth_client.get("/v1/items?limit=20").json()
    assert len(first["items"]) == 20
    assert first["next_cursor"] is not None
    second = auth_client.get(f"/v1/items?limit=20&cursor={first['next_cursor']}").json()
    assert len(second["items"]) == 5
    assert second["next_cursor"] is None
    ids = {i["id"] for i in first["items"]} | {i["id"] for i in second["items"]}
    assert len(ids) == 25  # no overlap across pages


@pytest.mark.parametrize(
    "cursor",
    [
        "not-base64!!",
        _b64("null"),  # JSON null      -> TypeError out of decode_cursor
        _b64('["a"]'),  # JSON list     -> TypeError out of decode_cursor
        _b64('{"after": 1}'),  # non-str after -> AttributeError out of UUID()
        _b64('{"after": "zzz"}'),  # non-uuid after -> ValueError out of UUID()
    ],
)
def test_a_crafted_cursor_is_the_FIRST_PAGE_never_a_500(
    auth_client: TestClient, cursor: str
) -> None:
    """`cursor` is opaque base64 straight off the wire — the only unvalidated string on the
    list endpoint, and `bool`/`int` query params are the only other client-controlled input.

    Every payload here used to escape as an unhandled exception and render as a bare
    `text/plain` "Internal Server Error": no problem+json for the typed client to parse, a
    traceback per request in the logs, and a Sentry event each time. The contract is that a
    garbage or stale bookmark degrades to page one, so this asserts the STATUS and the
    CONTENT TYPE — a 200 that stopped being JSON would pass a status-only check.
    """
    created = auth_client.post("/v1/items", json=ItemCreateFactory.build().model_dump())
    assert created.status_code == 201

    resp = auth_client.get(f"/v1/items?cursor={cursor}")

    assert resp.status_code == 200, (
        f"a crafted cursor produced {resp.status_code}: {resp.text[:120]}"
    )
    assert resp.headers["content-type"].startswith("application/json")
    # Non-vacuity: "page one" must really be page one, not an empty list from a broken filter.
    assert created.json()["id"] in {i["id"] for i in resp.json()["items"]}


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("title", "x" * 201),  # model caps title at 200
        ("description", "y" * 2001),  # model caps description at 2000
    ],
)
def test_an_over_length_field_is_422_problem_json_never_a_500(
    auth_client: TestClient, field: str, value: str
) -> None:
    """The length caps live on the MODEL (`Field(max_length=...)` -> VARCHAR(n)); the input
    DTOs used to declare none, so an over-long string sailed through Pydantic strict, reached
    Postgres, and came back as a `StringDataRightTruncation` -> a bare `text/plain` HTTP 500.

    Same defect class as the crafted cursor above: a client-controlled input escaping as an
    unhandled exception instead of a typed problem+json the generated client can read. The
    contract is that the API rejects it at the edge, so this asserts the STATUS **and** the
    CONTENT TYPE — a 500 that happened to be JSON would still be a broken contract.

    (`TestClient` re-raises unhandled server exceptions, so before the fix this test does not
    merely see a 500 — it errors out with the raw `DataError`, which is the point.)
    """
    payload = ItemCreateFactory.build().model_dump()
    payload[field] = value

    resp = auth_client.post("/v1/items", json=payload)

    assert resp.status_code == 422, f"over-long {field} produced {resp.status_code}"
    assert resp.headers["content-type"].startswith("application/problem+json")


def test_an_over_length_patch_is_422_problem_json_never_a_500(auth_client: TestClient) -> None:
    """`ItemUpdate` carries the same caps as `ItemCreate` — PATCH is a second way in."""
    created = auth_client.post("/v1/items", json=ItemCreateFactory.build().model_dump())
    assert created.status_code == 201

    resp = auth_client.patch(f"/v1/items/{created.json()['id']}", json={"title": "x" * 201})

    assert resp.status_code == 422, f"over-long PATCH title produced {resp.status_code}"
    assert resp.headers["content-type"].startswith("application/problem+json")


def test_a_field_at_EXACTLY_the_max_length_is_still_accepted(auth_client: TestClient) -> None:
    """Non-vacuity guard for the two tests above: an off-by-one cap (199 / 1999) would make
    them pass while silently rejecting input the database accepts."""
    payload = ItemCreateFactory.build().model_dump()
    payload["title"] = "x" * 200
    payload["description"] = "y" * 2000

    resp = auth_client.post("/v1/items", json=payload)

    assert resp.status_code == 201, f"a max-length payload was rejected: {resp.text[:160]}"
    assert resp.json()["title"] == "x" * 200


def test_missing_item_is_problem_json(auth_client: TestClient) -> None:
    resp = auth_client.get("/v1/items/00000000-0000-0000-0000-0000000000ff")
    assert resp.status_code == 404
    assert resp.headers["content-type"].startswith("application/problem+json")
    body = resp.json()
    assert body["status"] == 404 and body["title"] and body["instance"]


def test_unauthenticated_is_401_problem_json(client: TestClient) -> None:
    resp = client.get("/v1/items")
    assert resp.status_code == 401
    assert resp.headers["content-type"].startswith("application/problem+json")
