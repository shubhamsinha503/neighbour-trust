"""Apply SQL migrations in order.

    python -m infra.migrate

Locally the docker-compose entrypoint applies migrations on first boot of an
empty volume, which does nothing on an existing database — so this exists for
every case after the first, and for managed Postgres (Railway) where there is no
entrypoint hook at all.

Deliberately not Alembic. Every migration here is written to be idempotent
(`IF NOT EXISTS`, and the enum-creation blocks swallow duplicate_object), so
re-running the whole set is safe and a version table would be ceremony around a
guarantee the SQL already makes. That trade stops being right the first time a
migration needs to alter or drop something — at that point, switch to Alembic
rather than hand-rolling ordering logic here.
"""

from __future__ import annotations

import sys
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

import psycopg  # noqa: E402

from agents.common.config import database_url  # noqa: E402

MIGRATIONS_DIR = Path(__file__).parent / "migrations"


def main() -> int:
    files = sorted(MIGRATIONS_DIR.glob("*.sql"))
    if not files:
        print(f"No migrations found in {MIGRATIONS_DIR}", file=sys.stderr)
        return 1

    with psycopg.connect(database_url()) as conn:
        for path in files:
            print(f"applying {path.name} ...", end=" ", flush=True)
            conn.execute(path.read_text(encoding="utf-8"))
            conn.commit()
            print("ok")

    print(f"\n{len(files)} migration(s) applied.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
