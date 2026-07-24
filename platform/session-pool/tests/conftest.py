from __future__ import annotations

import pytest
from sqlalchemy.orm import Session

from session_pool.engine import make_engine, make_session_factory, ping, reset_schema
from session_pool.service import SessionPool


@pytest.fixture(scope="session")
def engine():
    eng = make_engine()
    if not ping(eng):
        pytest.skip("Postgres not reachable (docker compose up in platform/metadata-db)")
    return eng


@pytest.fixture()
def session(engine) -> Session:
    reset_schema(engine)
    with make_session_factory(engine)() as s:
        yield s


@pytest.fixture()
def pool(session) -> SessionPool:
    return SessionPool(session)
