"""Dump the FastAPI OpenAPI document to a stable JSON file (no server needed).

PHILOSOPHY.md (Config essentials → export_openapi.py): writes app.openapi() JSON with sorted
keys for stable diffs. This is the source the hey-api client is generated from, and the
artifact the CI drift check compares.
"""

from __future__ import annotations

import json
from pathlib import Path

from template_api.main import app

# openapi.json lives at the api workspace root: products/_template/api/openapi.json
# __file__ = .../api/src/template_api/export_openapi.py  -> parents[2] = .../api
OUTPUT = Path(__file__).resolve().parents[2] / "openapi.json"


def main() -> None:
    schema = app.openapi()
    # sort_keys=True => byte-stable diffs; trailing newline => clean git diff.
    OUTPUT.write_text(
        json.dumps(schema, indent=2, sort_keys=True, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    print(f"wrote {OUTPUT}")


if __name__ == "__main__":
    main()
