"""The task CLI's exit code is the only signal a scheduled Fly machine produces.

`python -m template_api.tasks prune-push-tokens` runs as a one-off machine on Fly's
daily schedule. Nobody watches it. The exit code is the entire contract: if a mistyped or
renamed task exited 0, the machine would report success every day forever while pruning
nothing, and the first symptom would be a push_tokens table that never shrinks.

prune_stale itself is covered in test_push.py against a real database. What is asserted here is
the dispatch layer around it — which is exactly the part that has no database and therefore no
excuse for being untested.
"""

from collections.abc import Generator
from typing import Any, cast

import pytest
import structlog

from template_api import tasks


@pytest.fixture(autouse=True)
def restore_structlog() -> Generator[None]:
    # main() calls configure_logging, which reconfigures structlog process-wide.
    yield
    structlog.reset_defaults()


def test_a_known_task_runs_and_exits_zero(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[int] = []
    monkeypatch.setitem(tasks.TASKS, "prune-push-tokens", lambda: calls.append(1))

    assert tasks.main(["prune-push-tokens"]) == 0
    # Both halves matter: an exit code of 0 without the call is the silent-success failure this
    # whole file exists to prevent.
    assert calls == [1]


@pytest.mark.parametrize(
    "argv",
    [
        pytest.param([], id="no-task"),
        pytest.param(["prune-push-token"], id="typo-singular"),
        pytest.param(["prune_push_tokens"], id="underscores-not-dashes"),
        pytest.param(["PRUNE-PUSH-TOKENS"], id="wrong-case"),
        pytest.param(["prune-push-tokens", "extra"], id="trailing-argument"),
        pytest.param(["--help"], id="a-flag-is-not-a-task"),
    ],
)
def test_anything_that_is_not_exactly_one_known_task_exits_nonzero(argv: list[str]) -> None:
    # Fly reports a non-zero exit as a failed machine run, which is the only way a broken
    # schedule becomes visible.
    assert tasks.main(argv) == 2


def test_an_unknown_task_does_not_run_a_task(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[int] = []
    monkeypatch.setitem(tasks.TASKS, "prune-push-tokens", lambda: calls.append(1))

    assert tasks.main(["something-else"]) == 2
    assert calls == []


def test_the_usage_line_lists_every_registered_task(capsys: pytest.CaptureFixture[str]) -> None:
    tasks.main([])
    usage = capsys.readouterr().out
    for name in tasks.TASKS:
        # A task registered but missing from usage is undiscoverable: the only way to find it
        # is to read the source, and the usage line is what an operator sees on a failed run.
        assert name in usage, f"{name} is registered but not offered in the usage line"


def test_the_task_name_in_the_deploy_instructions_is_real() -> None:
    # The module docstring carries the exact `fly machine run ...` command an operator
    # copy-pastes to create the schedule. Renaming a task without updating it produces a
    # scheduled machine that exits 2 every day, silently.
    doc = tasks.__doc__ or ""
    documented = [name for name in tasks.TASKS if name in doc]
    assert documented, f"none of {list(tasks.TASKS)} appear in the deploy instructions"


def test_running_a_task_configures_json_logging(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    # Task output goes to Fly logs and must be machine-parseable there, the same as the API's.
    # Without this call the task would log through structlog's unconfigured default.
    import json

    monkeypatch.setitem(
        tasks.TASKS, "prune-push-tokens", lambda: structlog.get_logger().info("did_a_thing")
    )
    assert tasks.main(["prune-push-tokens"]) == 0
    line = cast(dict[str, Any], json.loads(capsys.readouterr().out.strip().splitlines()[-1]))
    assert line["event"] == "did_a_thing"
