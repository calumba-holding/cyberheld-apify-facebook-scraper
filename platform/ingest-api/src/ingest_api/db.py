"""Request-scoped DB session dependency (over the metadata_db engine)."""

from __future__ import annotations

from collections.abc import Iterator

from sqlalchemy.orm import Session

from metadata_db.engine import make_engine, make_session_factory

_factory = None


def _session_factory():
    global _factory
    if _factory is None:
        _factory = make_session_factory(make_engine())
    return _factory


def get_session() -> Iterator[Session]:
    session = _session_factory()()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
