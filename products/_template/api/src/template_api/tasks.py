"""Scheduled jobs run as one-off Fly machines (PHILOSOPHY Background/scheduled jobs:
no queue infra): `python -m template_api.tasks <task>`.

One-off run (staging):
    fly machine run --app the777incident-template-api-stg \\
      registry.fly.io/the777incident-template-api-stg:latest \\
      python -m template_api.tasks prune-push-tokens

Scheduled (daily) machine — Fly's built-in scheduler:
    fly machine run --app the777incident-template-api-stg --schedule daily \\
      registry.fly.io/the777incident-template-api-stg:latest \\
      python -m template_api.tasks prune-push-tokens

NOTE: `--schedule` takes interval keywords ONLY (hourly/daily/weekly/monthly, NOT cron
expressions) and runs are "fuzzy" (approximate). If a product ever needs precise cron,
use Fly's Cron Manager or Supercronic — `--schedule` alone won't do it.
"""

import sys

import structlog
from sqlmodel import Session

from .db import get_engine
from .logging import configure_logging
from .services.push_service import PushService
from .settings import get_settings

log = structlog.get_logger()


def prune_push_tokens() -> int:
    """Delete push tokens not updated in 90 days (⚠️ OPEN default — PHILOSOPHY says
    "prune stale push tokens" without a threshold; confirm per product)."""
    with Session(get_engine()) as session:
        count = PushService(session=session).prune_stale()
    log.info("pruned_push_tokens", count=count)
    return count


TASKS = {"prune-push-tokens": prune_push_tokens}


def main(argv: list[str]) -> int:
    # Same structlog JSON config as the API, so task logs land in Fly logs
    # machine-parseable and carry the same shape.
    configure_logging(level=get_settings().log_level)
    if len(argv) == 1 and argv[0] in TASKS:
        TASKS[argv[0]]()
        return 0
    print(f"usage: python -m template_api.tasks <{'|'.join(TASKS)}>")
    return 2


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
