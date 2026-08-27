"""configure_logging is the half of the X-Request-Id chain nothing was asserting.

test_middleware.py proves the middleware BINDS request_id to the structlog contextvars. It
cannot prove the id ever reaches a log line: that depends on `merge_contextvars` being in this
processor chain. Delete that one processor and every middleware test still passes while every
log line silently loses its request id — and the client -> API -> logs correlation CLAUDE.md
calls a locked invariant is quietly gone, with nothing failing anywhere.

The same is true of the renderer. Swapping JSONRenderer for structlog's ConsoleRenderer produces
prettier local output and unparseable Fly/CI logs, and nothing about that failure looks like a
failure.
"""

import json
from collections.abc import Generator
from typing import Any, cast

import pytest
import structlog

from demo_api.logging import configure_logging


@pytest.fixture(autouse=True)
def isolate_structlog() -> Generator[None]:
    # structlog configuration and contextvars are process-global. Without this, whichever test
    # ran last decides how the rest of the suite logs.
    structlog.contextvars.clear_contextvars()
    yield
    structlog.contextvars.clear_contextvars()
    structlog.reset_defaults()


def _emit(capsys: pytest.CaptureFixture[str], **context: str) -> dict[str, Any]:
    """Log one line through the real configured chain and return the parsed payload."""
    structlog.contextvars.bind_contextvars(**context)
    structlog.get_logger().info("thing_happened", widget=7)
    out = capsys.readouterr().out.strip()
    assert out, "configure_logging produced no output at all"
    return cast(dict[str, Any], json.loads(out.splitlines()[-1]))


def test_log_lines_are_json(capsys: pytest.CaptureFixture[str]) -> None:
    configure_logging(level="INFO")
    # json.loads is the assertion: a ConsoleRenderer line raises here. Fly and CI both consume
    # these as structured records.
    payload = _emit(capsys)
    assert payload["event"] == "thing_happened"
    assert payload["widget"] == 7


def test_a_bound_request_id_reaches_every_line(capsys: pytest.CaptureFixture[str]) -> None:
    configure_logging(level="INFO")
    payload = _emit(capsys, request_id="req-abc-123")
    # The whole point of merge_contextvars. The middleware binds this per request; without the
    # processor the key simply never appears, and no test elsewhere would notice.
    assert payload["request_id"] == "req-abc-123"


def test_context_does_not_leak_between_requests(capsys: pytest.CaptureFixture[str]) -> None:
    configure_logging(level="INFO")
    _emit(capsys, request_id="first")
    structlog.contextvars.clear_contextvars()
    payload = _emit(capsys)
    # A stale id is worse than none: it attributes one request's logs to another.
    assert "request_id" not in payload


def test_the_level_is_recorded_on_the_line(capsys: pytest.CaptureFixture[str]) -> None:
    configure_logging(level="INFO")
    assert _emit(capsys)["level"] == "info"


def test_lines_carry_an_iso_timestamp(capsys: pytest.CaptureFixture[str]) -> None:
    configure_logging(level="INFO")
    payload = _emit(capsys)
    # ISO-8601, not epoch seconds — the log drain sorts and filters on this as a string.
    assert payload["timestamp"].count("-") >= 2
    assert "T" in payload["timestamp"]


def test_the_configured_level_actually_filters(capsys: pytest.CaptureFixture[str]) -> None:
    configure_logging(level="WARNING")
    structlog.get_logger().info("should_not_appear")
    assert capsys.readouterr().out.strip() == ""

    structlog.get_logger().warning("should_appear")
    warned = cast(dict[str, Any], json.loads(capsys.readouterr().out.strip()))
    assert warned["event"] == "should_appear"


def test_the_level_is_accepted_case_insensitively() -> None:
    # settings.log_level is free text from the environment; "info" must not crash the process
    # at startup. getLevelNamesMapping() is keyed by upper-case names only.
    configure_logging(level="warning")


def test_an_unknown_level_fails_loudly_at_startup() -> None:
    # The alternative — silently defaulting — gives a production service that logs nothing and
    # a config typo nobody finds. Crashing on boot is the safe direction.
    with pytest.raises(KeyError):
        configure_logging(level="LOUD")


def test_exceptions_render_as_structured_tracebacks(capsys: pytest.CaptureFixture[str]) -> None:
    configure_logging(level="INFO")
    try:
        raise ValueError("boom")
    except ValueError:
        structlog.get_logger().exception("it_broke")
    payload = cast(dict[str, Any], json.loads(capsys.readouterr().out.strip().splitlines()[-1]))
    # dict_tracebacks: a LIST of frames, not one pre-formatted string. Sentry and the log drain
    # can both read this; a string blob has to be re-parsed by whoever reads it.
    assert isinstance(payload["exception"], list)
    assert payload["exception"][0]["exc_type"] == "ValueError"
