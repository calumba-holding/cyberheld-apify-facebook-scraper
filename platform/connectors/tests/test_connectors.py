"""Connector Workers tests (#39). Offline via a fake resolver; sealing vs real PG."""

from __future__ import annotations

import json

import pytest

from connectors import connector_for_job_type, names, run_connector
from connectors.base import get


class FakeResolver:
    def __init__(self, a=None, mx=None):
        self._a = a or {}
        self._mx = mx or {}

    def a(self, domain):
        return self._a.get(domain, [])

    def mx(self, domain):
        return self._mx.get(domain, [])


def test_registry_lists_connectors():
    assert set(names()) == {"email-verify", "domain"}


def test_job_type_mapping():
    assert connector_for_job_type("enrich/email-verify") == "email-verify"
    assert connector_for_job_type("enrich/domain") == "domain"


def test_unknown_connector_raises():
    with pytest.raises(KeyError):
        get("nope")


def test_email_verify_valid_with_mx():
    r = run_connector("email-verify", "a@example.com", FakeResolver(mx={"example.com": ["mail.example.com"]}))
    assert r["valid_syntax"] and r["domain"] == "example.com"
    assert r["has_mx"] is True and r["deliverable"] is True


def test_email_verify_no_mx():
    r = run_connector("email-verify", "a@nomx.com", FakeResolver(mx={"nomx.com": []}))
    assert r["valid_syntax"] and r["has_mx"] is False and r["deliverable"] is False


def test_email_verify_bad_syntax():
    r = run_connector("email-verify", "not-an-email", FakeResolver())
    assert r["valid_syntax"] is False and r["deliverable"] is False


def test_domain_lookup():
    r = run_connector("domain", "Example.COM", FakeResolver(a={"example.com": ["93.184.216.34"]}))
    assert r["domain"] == "example.com" and r["resolves"] is True
    assert r["a_records"] == ["93.184.216.34"]


# --- enrichment output is sealed into the evidence record -------------------
def test_connector_result_is_sealed(tmp_path):
    pytest.importorskip("sqlalchemy")
    from metadata_db.engine import make_engine, make_session_factory, ping, reset_schema
    from metadata_db.repository import Repository

    from sealing import LocalWormBackend, verify_package
    from connectors import seal_connector_result

    eng = make_engine()
    if not ping(eng):
        pytest.skip("Postgres not reachable")
    reset_schema(eng)
    with make_session_factory(eng)() as s:
        repo = Repository(s)
        case = repo.open_case(external_ref="CASE-ENRICH")
        job = repo.create_job(case.id, "enrich/domain", "example.com")
        s.commit()

        result = run_connector("domain", "example.com", FakeResolver(a={"example.com": ["1.2.3.4"]}))
        storage = LocalWormBackend(tmp_path / "worm")
        sealed = seal_connector_result(s, job.id, "domain", result, storage=storage)
        s.commit()

    # the connector JSON is stored and the package verifies
    art = next(a for a in sealed.manifest["artifacts"] if a["kind"] == "other")
    assert json.loads(storage.get(art["object_key"])) == result
    ok, problems = verify_package(sealed.manifest_bytes, sealed.signature, sealed.public_key, storage)
    assert ok, problems
