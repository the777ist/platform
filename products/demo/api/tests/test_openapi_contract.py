"""operationIds ARE the generated client's symbol names, and nothing checked them.

main.py sets `generate_unique_id_function=_operation_id`, which returns the route FUNCTION name,
so `list_items` becomes hey-api's `listItems` / `listItemsInfiniteOptions`. The comment beside it
states the constraint plainly — "route function names must stay unique across ALL routers" — and
nothing enforced it.

The typegen drift check does not cover this. Drift compares the committed client against a fresh
regeneration, so someone who adds a colliding route regenerates, commits both, and the check
passes: the broken client is now the committed one. The failure surfaces later, in whichever call
site silently bound to the wrong function.

Asserted against the app rather than the committed openapi.json so it fails at the source, in the
product that introduced it, rather than downstream in a generated artefact nobody reads.
"""

from collections import Counter
from typing import Any, cast

from demo_api.main import create_app


def _operations() -> list[tuple[str, str, str]]:
    """(operationId, METHOD, path) for every operation in the generated schema."""
    schema = create_app().openapi()
    found: list[tuple[str, str, str]] = []
    for path, methods in cast(dict[str, dict[str, Any]], schema["paths"]).items():
        for method, operation in methods.items():
            op_id = operation.get("operationId")
            if op_id is not None:
                found.append((str(op_id), method.upper(), str(path)))
    return found


def test_the_schema_actually_has_operations() -> None:
    # Without this the uniqueness check below passes VACUOUSLY: a schema that produced no
    # operations has no duplicates either.
    ops = _operations()
    assert len(ops) >= 5, ops
    assert {"hello", "list_items", "me"} <= {op_id for op_id, _, _ in ops}


def test_every_operation_id_is_unique() -> None:
    ops = _operations()
    duplicates = [
        op_id for op_id, count in Counter(op_id for op_id, _, _ in ops).items() if count > 1
    ]
    assert not duplicates, (
        f"duplicate operationIds {duplicates} — route function names must be unique across ALL "
        f"routers, because they become the generated client's symbol names: "
        f"{[o for o in ops if o[0] in duplicates]}"
    )


def test_operation_ids_are_the_FUNCTION_name_not_fastapi_defaults() -> None:
    # FastAPI's default would be `list_items_v1_items_get`, which leaks the path into every hook
    # name in the generated client. Removing generate_unique_id_function renames every symbol the
    # app imports at once — a rename the drift check reports as "everything changed", which is
    # the least useful way to learn about it.
    ids = {op_id for op_id, _, _ in _operations()}
    assert "list_items" in ids
    assert not any("_v1_" in op_id or op_id.endswith("_get") for op_id in ids), sorted(ids)
