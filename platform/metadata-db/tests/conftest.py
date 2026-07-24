from __future__ import annotations

import pytest
from sqlalchemy.orm import Session

from metadata_db.engine import make_engine, make_session_factory, ping, reset_schema
from metadata_db.repository import Repository


@pytest.fixture(scope="session")
def engine():
    eng = make_engine()
    if not ping(eng):
        pytest.skip("Postgres not reachable (start docker-compose in platform/metadata-db)")
    return eng


@pytest.fixture()
def session(engine) -> Session:
    # Fresh schema per test so custody-log/trigger assertions are isolated.
    reset_schema(engine)
    factory = make_session_factory(engine)
    with factory() as s:
        yield s


@pytest.fixture()
def repo(session) -> Repository:
    return Repository(session)
