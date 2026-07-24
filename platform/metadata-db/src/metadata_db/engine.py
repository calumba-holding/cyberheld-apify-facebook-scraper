"""Engine, session factory, and migration runner."""

from __future__ import annotations

from pathlib import Path

from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

from .config import database_url

MIGRATIONS_DIR = Path(__file__).resolve().parents[2] / "migrations"


def make_engine(url: str | None = None) -> Engine:
    return create_engine(url or database_url(), future=True)


def make_session_factory(engine: Engine) -> sessionmaker[Session]:
    return sessionmaker(bind=engine, future=True, expire_on_commit=False)


def _run_sql_file(engine: Engine, filename: str) -> None:
    sql = (MIGRATIONS_DIR / filename).read_text()
    # DDL scripts contain multiple statements + their own BEGIN/COMMIT; run raw.
    with engine.connect() as conn:
        conn = conn.execution_options(isolation_level="AUTOCOMMIT")
        conn.exec_driver_sql(sql)


def migrate_up(engine: Engine) -> None:
    _run_sql_file(engine, "0001_init.sql")


def migrate_down(engine: Engine) -> None:
    _run_sql_file(engine, "0001_init.down.sql")


def reset_schema(engine: Engine) -> None:
    """Down (idempotent) then up — a clean schema for tests."""
    migrate_down(engine)
    migrate_up(engine)


def ping(engine: Engine) -> bool:
    with engine.connect() as conn:
        return conn.execute(text("select 1")).scalar_one() == 1
