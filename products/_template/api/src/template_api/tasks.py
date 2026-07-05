"""Lightweight scheduled jobs run on Fly scheduled machines (no queue infra).

Phase 8 wires the Fly scheduled machine that invokes `prune-stale-tokens`.
"""

import sys

from sqlmodel import Session

from .db import get_engine
from .services.push_service import PushService


def prune_stale_tokens() -> None:
    with Session(get_engine()) as session:
        removed = PushService(session=session).prune_stale()
        print(f"pruned {removed} stale push tokens")


def main(argv: list[str]) -> int:
    if argv and argv[0] == "prune-stale-tokens":
        prune_stale_tokens()
        return 0
    print("usage: python -m template_api.tasks prune-stale-tokens")
    return 2


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
