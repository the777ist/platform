from typing import Annotated

from fastapi import Depends
from sqlmodel import Session

from ..db import get_session

# Annotated form (FastAPI-recommended) — a bare `session: Session = Depends(...)` default
# violates ruff B008 (function call in default), which this repo's lint config enables.
SessionDep = Annotated[Session, Depends(get_session)]


class BaseService:
    """Every service holds the request Session via Depends (Key ruling #10).

    Services are real cohesive objects (NOT staticmethod buckets): each owns its
    aggregate's business logic AND data access. No repository layer — services query
    directly via self.session. Outside a request (seed.py, tasks.py, tests), construct
    with an explicit real Session: `PushService(session=session)`.
    """

    def __init__(self, session: SessionDep) -> None:
        self.session = session
