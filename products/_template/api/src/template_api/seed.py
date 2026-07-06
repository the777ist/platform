from sqlmodel import Session

from .db import get_engine
from .models import Item

SEED_OWNER = "00000000-0000-0000-0000-000000000001"  # local dev placeholder user


def main() -> None:
    with Session(get_engine()) as session:
        for i in range(1, 26):
            session.add(Item(owner_id=SEED_OWNER, title=f"Seed item {i}", description="seeded"))
        session.commit()
    print("seeded 25 items")


if __name__ == "__main__":
    main()
