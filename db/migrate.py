"""Lightweight SQL migration runner for Vulcan.

Reads db/migrations/*.sql in lexicographic order, tracks applied migrations
in a _migrations table, and runs any unapplied ones.

Usage:
    python3 -m db.migrate          # from repo root
    make db-migrate                # via Makefile
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

import psycopg2

MIGRATIONS_DIR = Path(__file__).resolve().parent / "migrations"


def _get_dsn() -> str:
    # Load .env if present
    env_path = Path(__file__).resolve().parent.parent / ".env"
    if env_path.is_file():
        for line in env_path.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, _, val = line.partition("=")
                os.environ.setdefault(key.strip(), val.strip())

    return os.getenv(
        "DATABASE_URL",
        "postgresql://vulcan:vulcan_dev@localhost:5432/vulcan",
    )


def _ensure_migrations_table(conn) -> None:
    with conn.cursor() as cur:
        cur.execute("""
            CREATE TABLE IF NOT EXISTS _migrations (
                name VARCHAR(255) PRIMARY KEY,
                applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
        """)
    conn.commit()


def _applied_migrations(conn) -> set[str]:
    with conn.cursor() as cur:
        cur.execute("SELECT name FROM _migrations ORDER BY name;")
        return {row[0] for row in cur.fetchall()}


def _run_migration(conn, name: str, sql: str) -> None:
    with conn.cursor() as cur:
        cur.execute(sql)
        cur.execute("INSERT INTO _migrations (name) VALUES (%s);", (name,))
    conn.commit()


def main() -> None:
    if not MIGRATIONS_DIR.is_dir():
        print("No migrations directory found.")
        return

    migration_files = sorted(MIGRATIONS_DIR.glob("*.sql"))
    if not migration_files:
        print("No migration files found.")
        return

    dsn = _get_dsn()
    conn = psycopg2.connect(dsn)
    try:
        _ensure_migrations_table(conn)
        applied = _applied_migrations(conn)

        pending = [f for f in migration_files if f.name not in applied]
        if not pending:
            print("All migrations already applied.")
            return

        for migration_file in pending:
            print(f"Applying {migration_file.name}...")
            sql = migration_file.read_text(encoding="utf-8")
            try:
                _run_migration(conn, migration_file.name, sql)
                print(f"  ✓ {migration_file.name}")
            except Exception as exc:
                conn.rollback()
                print(f"  ✗ {migration_file.name}: {exc}", file=sys.stderr)
                sys.exit(1)

        print(f"\nApplied {len(pending)} migration(s).")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
