from __future__ import annotations

import pytest
from sqlalchemy.orm import Session

from metadata_db.engine import make_engine, make_session_factory, ping, reset_schema
from metadata_db.repository import Repository

from sealing import LocalDevTimestamper, LocalWormBackend, ManifestSigner, SealingService


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
def signer() -> ManifestSigner:
    return ManifestSigner.generate()


@pytest.fixture()
def storage(tmp_path) -> LocalWormBackend:
    return LocalWormBackend(tmp_path / "worm")


@pytest.fixture()
def service(storage, signer) -> SealingService:
    # In dev the timestamper uses its own key; here reuse the signer key for brevity.
    return SealingService(storage, LocalDevTimestamper(signer), signer)


@pytest.fixture()
def job(session):
    repo = Repository(session)
    case = repo.open_case(external_ref="CASE-SEAL")
    j = repo.create_job(case.id, job_type="fb/post", target_url="https://fb.com/x")
    session.commit()
    return j
