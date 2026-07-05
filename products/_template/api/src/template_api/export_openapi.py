import json
from pathlib import Path

from .main import app

OUTPUT = Path(__file__).resolve().parents[2] / "openapi.json"  # products/_template/api/openapi.json


def main() -> None:
    schema = app.openapi()
    OUTPUT.write_text(json.dumps(schema, indent=2, sort_keys=True) + "\n")
    print(f"wrote {OUTPUT}")


if __name__ == "__main__":
    main()
