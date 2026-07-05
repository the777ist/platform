import base64
import json

from pydantic import BaseModel, ConfigDict

DEFAULT_LIMIT = 20
MAX_LIMIT = 100


def encode_cursor(value: str) -> str:
    return base64.urlsafe_b64encode(json.dumps({"after": value}).encode()).decode()


def decode_cursor(cursor: str | None) -> str | None:
    if not cursor:
        return None
    try:
        return json.loads(base64.urlsafe_b64decode(cursor.encode()).decode())["after"]
    except (ValueError, KeyError):
        return None


def clamp_limit(limit: int) -> int:
    return max(1, min(limit, MAX_LIMIT))


class Page[T](BaseModel):
    """Cursor-paginated page envelope. useInfiniteQuery-ready."""

    model_config = ConfigDict(strict=True)

    items: list[T]
    next_cursor: str | None = None
