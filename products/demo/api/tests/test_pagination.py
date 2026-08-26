"""Cursor pagination is a locked contract (PHILOSOPHY: "cursor pagination,
useInfiniteQuery-ready"), and its failure modes are the quiet kind.

A cursor is opaque base64 that arrives straight from a client, so `decode_cursor` is
untrusted input on a hot path: garbage must degrade to "start from the beginning", never
raise, or a stale bookmark in someone's browser becomes a 500. And `clamp_limit` is the only
thing standing between `?limit=1000000` and a full table scan.

No database needed — these are pure functions.
"""

import pytest

from demo_api.pagination import (
    DEFAULT_LIMIT,
    MAX_LIMIT,
    Page,
    clamp_limit,
    decode_cursor,
    encode_cursor,
)


class TestCursorRoundTrip:
    def test_encodes_and_decodes_back_to_the_same_value(self) -> None:
        cursor = encode_cursor("01890a5d-ac96-774b-bcce-b302099a8057")
        assert decode_cursor(cursor) == "01890a5d-ac96-774b-bcce-b302099a8057"

    def test_cursor_is_url_safe(self) -> None:
        # It travels as a query parameter; + and / would need escaping and get mangled.
        cursor = encode_cursor("a" * 40)
        assert "+" not in cursor
        assert "/" not in cursor

    def test_cursor_is_opaque_rather_than_the_raw_id(self) -> None:
        # Clients must not be able to hand-craft one from an id they happen to know.
        assert encode_cursor("plain-id") != "plain-id"


class TestDecodeIsTotal:
    """Every one of these arrives from an untrusted client. None may raise."""

    @pytest.mark.parametrize(
        "value",
        [
            None,  # first page
            "",  # empty query param
            "not-base64!!",  # junk
            "YWJj",  # valid base64, not JSON
            "eyJ4IjoxfQ==",  # valid JSON, missing the "after" key
            "e30=",  # empty JSON object
        ],
    )
    def test_bad_cursor_means_first_page_not_an_exception(self, value: str | None) -> None:
        # A stale bookmark would otherwise be a 500 rather than simply the first page.
        assert decode_cursor(value) is None


class TestClampLimit:
    @pytest.mark.parametrize(
        ("requested", "expected"),
        [
            (0, 1),  # a zero-size page would loop forever
            (-5, 1),  # negatives too
            (1, 1),
            (DEFAULT_LIMIT, DEFAULT_LIMIT),
            (MAX_LIMIT, MAX_LIMIT),
            (MAX_LIMIT + 1, MAX_LIMIT),
            (1_000_000, MAX_LIMIT),  # the DoS shape
        ],
    )
    def test_clamps_into_range(self, requested: int, expected: int) -> None:
        assert clamp_limit(requested) == expected


class TestPageEnvelope:
    def test_last_page_carries_a_null_cursor(self) -> None:
        # null next_cursor IS TanStack's "no more pages" signal; anything else loops.
        page: Page[str] = Page(items=["a", "b"])
        assert page.next_cursor is None

    def test_is_strict_about_types(self) -> None:
        # Pydantic strict mode is locked; a coerced int here would reach the typed client
        # as the wrong shape.
        with pytest.raises(ValueError):
            Page[str](items="not-a-list")  # type: ignore[arg-type]
