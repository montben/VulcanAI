"""Database connection and session management for Vulcan."""

from __future__ import annotations

import os
from collections.abc import Generator
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

# Load .env before reading DATABASE_URL — this module is imported before
# pipeline.config where load_dotenv was previously called.
_repo_root = Path(__file__).resolve().parent.parent
for _candidate in (_repo_root / ".env", Path(__file__).resolve().parent / ".env"):
    if _candidate.is_file():
        load_dotenv(_candidate, override=False)
        break


def _build_database_url() -> str:
    return os.getenv(
        "DATABASE_URL",
        "postgresql://vulcan:vulcan_dev@localhost:5432/vulcan",
    )


engine = create_engine(_build_database_url(), pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False)


class Base(DeclarativeBase):
    pass


def get_db() -> Generator[Session, None, None]:
    """FastAPI dependency that yields a database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
