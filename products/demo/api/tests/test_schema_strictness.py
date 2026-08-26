"""Pydantic strict mode is a locked decision, and only a base class enforces it.

PHILOSOPHY: "Type strictness: pyright strict mode + Pydantic strict mode, enforced in pre-push
AND CI". In practice that rests on every DTO inheriting StrictDTO. A new schema written as
`class FooCreate(BaseModel)` is lax, silently — it type-checks, it lints, it serialises, and it
quietly coerces whatever a client sends. That is exactly how the invariant erodes as products
grow past the handful of DTOs the demo ships.

Walking the package rather than listing the classes is the point: a schema added tomorrow is
covered without anyone remembering this file exists.
"""

import importlib
import inspect
import pkgutil

import pytest
from pydantic import BaseModel, ValidationError

import demo_api.schemas as schemas_pkg
from demo_api.schemas.item import ItemCreate


def _schema_classes() -> list[type[BaseModel]]:
    found: list[type[BaseModel]] = []
    for module_info in pkgutil.iter_modules(list(schemas_pkg.__path__)):
        module = importlib.import_module(f"{schemas_pkg.__name__}.{module_info.name}")
        for _, obj in vars(module).items():
            if (
                inspect.isclass(obj)
                and issubclass(obj, BaseModel)
                and obj.__module__ == module.__name__
            ):
                found.append(obj)
    return found


def test_the_walk_actually_finds_the_schemas() -> None:
    # Without this the test below passes VACUOUSLY: an import that silently found nothing would
    # report every schema as strict.
    names = {c.__name__ for c in _schema_classes()}
    assert {"ItemCreate", "ItemRead", "MeRead"} <= names, names


@pytest.mark.parametrize("model", _schema_classes(), ids=lambda m: m.__name__)
def test_every_schema_is_strict(model: type[BaseModel]) -> None:
    assert model.model_config.get("strict") is True, (
        f"{model.__name__} is lax — inherit StrictDTO rather than BaseModel"
    )


def test_strict_actually_REJECTS_a_coerced_value() -> None:
    # Asserted through behaviour, not just the config flag: strict is only worth having because
    # of what it refuses. In lax mode Pydantic would accept an int here and hand the service a
    # silently converted value, which is how a client's type error becomes a database row.
    with pytest.raises(ValidationError):
        ItemCreate(title=123)  # pyright: ignore[reportArgumentType]


def test_a_correctly_typed_payload_is_still_accepted() -> None:
    # The other direction, so "strict" never quietly becomes "rejects everything".
    assert ItemCreate(title="a real title").title == "a real title"


# Fields the SERVER owns. A client that can send any of these is asking to choose who owns the
# row it is creating, or when it was created.
SERVER_OWNED = {"owner_id", "user_id", "id", "created_at", "updated_at"}


def _input_dtos() -> list[type[BaseModel]]:
    """DTOs a request BODY is validated into — the ones a client controls."""
    return [c for c in _schema_classes() if c.__name__.endswith(("Create", "Update"))]


def test_the_walk_finds_the_input_dtos() -> None:
    # Non-vacuity: an empty list has no forbidden fields either.
    names = {c.__name__ for c in _input_dtos()}
    assert {"ItemCreate", "ItemUpdate"} <= names, names


@pytest.mark.parametrize("model", _input_dtos(), ids=lambda m: m.__name__)
def test_no_input_dto_lets_a_client_set_a_server_owned_field(model: type[BaseModel]) -> None:
    """owner_id is set from the VERIFIED token, never from the body.

    tests/test_tenant_isolation.py covers the query side of this boundary — that one user cannot
    reach another's rows. This is the write side: a Create DTO carrying `owner_id` invites a
    service to pass it through (`Model(**data.model_dump())` is the natural way to write these),
    and the moment one does, a client chooses who owns the row it just created. Strict mode does
    not help — the field would be declared, so the value is perfectly valid.

    The demo's own item test already asserts "owner_id is set server-side"; this makes that
    true by construction for every DTO a product adds later.
    """
    leaked = SERVER_OWNED & set(model.model_fields)
    assert not leaked, (
        f"{model.__name__} accepts {sorted(leaked)} from the client — the server owns those. "
        f"Set them from CurrentUser in the service, and keep them out of the input DTO."
    )
