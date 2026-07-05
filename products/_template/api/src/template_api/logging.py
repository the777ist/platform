"""structlog JSON logging shared by the API and tasks (PHILOSOPHY Observability).

`merge_contextvars` is what threads the request_id (bound per-request by the
middleware) into every log line emitted during that request; JSONRenderer keeps
Fly/CI log output machine-parseable.
"""

import logging
import sys

import structlog


def configure_logging(*, level: str = "INFO") -> None:
    logging.basicConfig(format="%(message)s", stream=sys.stdout, level=level)
    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,  # pulls request_id into every line
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.processors.dict_tracebacks,
            structlog.processors.JSONRenderer(),  # JSON logs
        ],
        # NOT logging.getLevelName(level) — its str->int direction is deprecated
        # (pyright strict reportDeprecated); the mapping is the 3.11+ replacement.
        wrapper_class=structlog.make_filtering_bound_logger(
            logging.getLevelNamesMapping()[level.upper()]
        ),
        logger_factory=structlog.PrintLoggerFactory(),
        cache_logger_on_first_use=True,
    )
