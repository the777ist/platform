"""Owner scoping IS the authorization boundary, and nothing tested it.

The API connects with a privileged role that BYPASSES RLS — that is deliberate and documented
(the migration's own comment says so). RLS deny-all protects the database from PostgREST and
Realtime, i.e. from clients holding an anon/authenticated key. It does NOTHING about the API's
own queries. So the only thing standing between one user and another user's rows is the
`owner_id` filter in the service layer.

Every existing test authenticated as the SAME user, so all three ways that boundary can be
removed passed the whole suite green:

  * dropping `item.owner_id != owner_id` from _require  -> any user may GET/PATCH/DELETE any item
  * dropping `.where(Item.owner_id == owner_id)` from list() -> every list returns everyone's rows
  * matching a push token on device_id alone -> one user's notifications go to another's device

Each was verified by mutation: 124 tests passed with each of them removed.

404 rather than 403 is deliberate: telling an attacker that an id exists but is not theirs is an
existence oracle. The assertions below pin the status for that reason, not by accident.
"""

from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session

from demo_api.auth import get_current_user
from demo_api.db import get_session
from demo_api.main import create_app
from demo_api.schemas.user import MeRead

from .conftest import TEST_OWNER
from .factories import ItemCreateFactory

OTHER_OWNER = "22222222-2222-2222-2222-222222222222"


@pytest.fixture
def other_client(session: Session) -> Generator[TestClient]:
    """A second authenticated user, sharing the same database session as `auth_client`."""
    app = create_app()
    app.dependency_overrides[get_session] = lambda: session
    app.dependency_overrides[get_current_user] = lambda: MeRead(
        id=OTHER_OWNER, email="other@example.com"
    )
    yield TestClient(app)
    app.dependency_overrides.clear()


def _create(client: TestClient) -> str:
    created = client.post("/v1/items", json=ItemCreateFactory.build().model_dump())
    assert created.status_code == 201
    return str(created.json()["id"])


def test_the_two_clients_really_are_different_users(
    auth_client: TestClient, other_client: TestClient
) -> None:
    # Non-vacuity: if both fixtures authenticated as the same user, every isolation test below
    # would pass while proving nothing at all.
    assert auth_client.get("/v1/me").json()["id"] == TEST_OWNER
    assert other_client.get("/v1/me").json()["id"] == OTHER_OWNER
    assert TEST_OWNER != OTHER_OWNER


def test_list_returns_only_my_items(auth_client: TestClient, other_client: TestClient) -> None:
    mine = _create(auth_client)
    theirs = _create(other_client)

    ids = {i["id"] for i in auth_client.get("/v1/items").json()["items"]}
    assert mine in ids
    assert theirs not in ids, "another user's item appeared in my list"


def test_every_item_i_can_list_is_actually_mine(
    auth_client: TestClient, other_client: TestClient
) -> None:
    # The stronger form: not just "theirs is absent" but "nothing foreign is present", which
    # still holds if the other user has many rows.
    for _ in range(3):
        _create(other_client)
    _create(auth_client)

    for item in auth_client.get("/v1/items").json()["items"]:
        assert item["owner_id"] == TEST_OWNER


def test_reading_anothers_item_is_404_not_403(
    auth_client: TestClient, other_client: TestClient
) -> None:
    theirs = _create(other_client)
    response = auth_client.get(f"/v1/items/{theirs}")
    # 404, not 403: a 403 would confirm the id exists, which is an existence oracle over
    # somebody else's data.
    assert response.status_code == 404


def test_updating_anothers_item_is_refused_AND_leaves_it_unchanged(
    auth_client: TestClient, other_client: TestClient
) -> None:
    theirs = _create(other_client)
    before = other_client.get(f"/v1/items/{theirs}").json()["title"]

    assert auth_client.patch(f"/v1/items/{theirs}", json={"title": "hijacked"}).status_code == 404

    # The status alone is not proof: assert through the owner that the row is untouched.
    assert other_client.get(f"/v1/items/{theirs}").json()["title"] == before


def test_deleting_anothers_item_is_refused_AND_leaves_it_alive(
    auth_client: TestClient, other_client: TestClient
) -> None:
    theirs = _create(other_client)

    assert auth_client.delete(f"/v1/items/{theirs}").status_code == 404

    assert other_client.get(f"/v1/items/{theirs}").status_code == 200, "the item was deleted anyway"


def test_a_push_token_registered_by_one_user_is_not_reassigned_to_another(
    auth_client: TestClient, other_client: TestClient
) -> None:
    # Same device_id, two users. Matching on device_id ALONE would move the existing row to
    # whoever registered last, and that user's notifications would then be delivered to the
    # first user's device.
    device = "shared-device-id"
    mine = auth_client.post(
        "/v1/push-tokens", json={"device_id": device, "expo_token": "ExponentPushToken[mine]"}
    )
    assert mine.status_code in (200, 201)

    theirs = other_client.post(
        "/v1/push-tokens", json={"device_id": device, "expo_token": "ExponentPushToken[theirs]"}
    )
    assert theirs.status_code in (200, 201)

    # Two rows, one per user — not one row that changed hands.
    assert mine.json()["id"] != theirs.json()["id"], (
        "the second user took over the first's token row"
    )
