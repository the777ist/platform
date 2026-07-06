from fastapi.testclient import TestClient

from tests.factories import ItemCreateFactory


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
