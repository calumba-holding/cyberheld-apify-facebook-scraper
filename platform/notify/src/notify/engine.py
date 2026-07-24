"""Engine + migration runner (reuses metadata_db helpers / DATABASE_URL)."""

from __future__ import annotations

from pathlib import Path

from sqlalchemy.engine import Engine

from metadata_db.engine import make_engine, make_session_factory, ping  # noqa: F401

MIGRATIONS_DIR = Path(__file__).resolve().parents[2] / "migrations"


def _run(engine: Engine, filename: str) -> None:
    sql = (MIGRATIONS_DIR / filename).read_text()
    with engine.connect() as conn:
        conn = conn.execution_options(isolation_level="AUTOCOMMIT")
        conn.exec_driver_sql(sql)


def migrate_up(engine: Engine) -> None:
    _run(engine, "0001_notify.sql")


def migrate_down(engine: Engine) -> None:
    _run(engine, "0001_notify.down.sql")
