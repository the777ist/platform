import base64
import json
from typing import cast
from uuid import UUID

from pydantic import BaseModel, ConfigDict

DEFAULT_LIMIT = 20
MAX_LIMIT = 100


def encode_cursor(value: str) -> str:
    return base64.urlsafe_b64encode(json.dumps({"after": value}).encode()).decode()


def decode_cursor(cursor: str | None) -> str | None:
    """TOTAL by contract: a malformed cursor is "first page", NEVER an exception.

    Every byte here is untrusted — a cursor is opaque base64 straight off the wire.
    `except (ValueError, KeyError)` around the whole expression was not enough: valid base64
    carrying valid JSON that is not an OBJECT (`null`, `[]`, `5`, `"s"`) made `payload["after"]`
    raise TypeError, which escaped the handler chain entirely and rendered as a bare `text/plain`
    HTTP 500 — no problem+json for the typed client, a traceback per request, a Sentry event
    each time. Parse, then NARROW; do not catch-and-hope.
    """
    if not cursor:
        return None
    try:
        # binascii.Error, UnicodeDecodeError and JSONDecodeError all subclass ValueError.
        payload: object = json.loads(base64.urlsafe_b64decode(cursor.encode()).decode())
    except ValueError:
        return None
    if not isinstance(payload, dict):
        return None
    # cast: a JSON object's keys are str by construction, and isinstance cannot express that.
    after: object = cast("dict[str, object]", payload).get("after")
    return after if isinstance(after, str) else None


def decode_cursor_id(cursor: str | None) -> UUID | None:
    """The keyset cursor as the UUID the query needs. SERVICES CALL THIS, not `decode_cursor`.

    `decode_cursor` guarantees a str, not a UUID, so a service writing `UUID(decode_cursor(c))`
    still raised on a perfectly well-formed cursor carrying `{"after": "zzz"}` — the same
    plain-text 500, one layer further out. Keyset pagination is UUIDv7-`id`-ordered repo-wide,
    so the conversion and its failure mode belong here rather than being re-derived per service.
    """
    after = decode_cursor(cursor)
    if after is None:
        return None
    try:
        return UUID(after)
    except ValueError:
        return None


def clamp_limit(limit: int) -> int:
    return max(1, min(limit, MAX_LIMIT))


class Page[T](BaseModel):
    """Cursor-paginated page envelope. useInfiniteQuery-ready."""

    model_config = ConfigDict(strict=True)

    items: list[T]
    next_cursor: str | None = None
