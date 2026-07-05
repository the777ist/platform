"""Dump the FastAPI OpenAPI document to a stable JSON file (no server needed).

PHILOSOPHY.md (Config essentials → export_openapi.py): writes app.openapi() JSON with sorted
keys for stable diffs. This is the source the hey-api client is generated from, and the
artifact the CI drift check compares.
"""

from __future__ import annotations

import json
import os
from pathlib import Path

# openapi.json lives at the api workspace root: products/demo/api/openapi.json
# __file__ = .../api/src/demo_api/export_openapi.py  -> parents[2] = .../api
OUTPUT = Path(__file__).resolve().parents[2] / "openapi.json"


def main() -> None:
    # Schema export is HERMETIC — no DB, no .env needed. main.py builds the app at
    # import time and Settings requires the DB URLs, so provide inert placeholders when
    # unset (the engine uses NullPool and never connects until a request). The import
    # lives inside main() so the placeholders exist first (tests/__init__.py pattern).
    os.environ.setdefault("DATABASE_URL", "postgresql+psycopg://localhost/openapi-export")
    os.environ.setdefault("DATABASE_MIGRATION_URL", "postgresql+psycopg://localhost/openapi-export")
    from demo_api.main import app

    schema = app.openapi()
    # sort_keys=True => byte-stable diffs; trailing newline => clean git diff.
    OUTPUT.write_text(
        json.dumps(schema, indent=2, sort_keys=True, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    print(f"wrote {OUTPUT}")


if __name__ == "__main__":
    main()
