"""Pydantic strict mode is a locked decision, and only a base class enforces it.

PHILOSOPHY: "Type strictness: pyright strict mode + Pydantic strict mode, enforced in pre-push
AND CI". In practice that rests on every DTO inheriting StrictDTO. A new schema written as
`class FooCreate(BaseModel)` is lax, silently — it type-checks, it lints, it serialises, and it
quietly coerces whatever a client sends. That is exactly how the invariant erodes as products
grow past the handful of DTOs the template ships.

Walking the package rather than listing the classes is the point: a schema added tomorrow is
covered without anyone remembering this file exists.
"""

import importlib
import inspect
import pkgutil

import pytest
from pydantic import BaseModel, ValidationError

import template_api.schemas as schemas_pkg
from template_api.schemas.item import ItemCreate


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
