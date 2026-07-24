"""LLM Triage tests (#41). FakeClassifier keeps it offline; real Postgres."""

from __future__ import annotations

import pytest
from sqlalchemy import func, select

from metadata_db.engine import make_engine, make_session_factory, ping
from metadata_db.engine import reset_schema as reset_metadata
from metadata_db.models import MediaAsset
from metadata_db.repository import Repository

from triage import FakeClassifier, flagged_only, triage_job
from triage.engine import migrate_down as triage_down
from triage.engine import migrate_up as triage_up
from triage.models import TriageFlag


@pytest.fixture()
def job_with_comments():
    eng = make_engine()
    if not ping(eng):
        pytest.skip("Postgres not reachable")
    triage_down(eng)      # drop triage_flags first (it FKs jobs/content_items)
    reset_metadata(eng)   # now safe to drop/recreate jobs, content_items, ...
    triage_up(eng)        # recreate triage_flags against the fresh tables
    with make_session_factory(eng)() as s:
        repo = Repository(s)
        case = repo.open_case(external_ref="CASE-TRIAGE")
        job = repo.create_job(case.id, "fb/post", "https://fb.com/x")
        comments = [
            "have a nice day",
            "I will kill you, this is a threat",
            "great post, thanks",
            "you should watch your back, threat incoming",
        ]
        for i, c in enumerate(comments):
            repo.add_content_item(
                job.id, platform="facebook", item_type="comment",
                source_url=f"https://fb.com/x#c{i}", payload={"text": c},
            )
        s.commit()
        return {"engine": eng, "job_id": job.id}


def _session(eng):
    return make_session_factory(eng)()


def test_triage_ranks_and_flags(job_with_comments):
    eng, job_id = job_with_comments["engine"], job_with_comments["job_id"]
    clf = FakeClassifier(flag_terms=["kill", "threat"])
    with _session(eng) as s:
        results = triage_job(s, job_id, clf, cutoff=0.5)
        s.commit()

    # ranked by score desc; the two threatening comments float to the top
    assert results[0].score >= results[-1].score
    flagged = flagged_only(results)
    assert len(flagged) == 2
    assert all(f.crosses_threshold for f in flagged)
    # the benign comments are not flagged
    assert all(not f.crosses_threshold for f in results if f.score < 0.5)


def test_flags_persisted_as_derived_metadata(job_with_comments):
    eng, job_id = job_with_comments["engine"], job_with_comments["job_id"]
    with _session(eng) as s:
        triage_job(s, job_id, FakeClassifier(["threat", "kill"]), cutoff=0.5)
        s.commit()
    with _session(eng) as s:
        n_flags = s.execute(select(func.count()).select_from(TriageFlag)).scalar_one()
        assert n_flags == 4  # one per comment
        stored = s.execute(select(TriageFlag)).scalars().all()
        assert all(f.model == "fake" for f in stored)


def test_triage_does_not_touch_sealed_evidence(job_with_comments):
    eng, job_id = job_with_comments["engine"], job_with_comments["job_id"]
    with _session(eng) as s:
        triage_job(s, job_id, FakeClassifier(["threat"]), cutoff=0.5)
        s.commit()
    # triage writes only triage_flags; no media_assets (sealed artifacts) created
    with _session(eng) as s:
        n_assets = s.execute(select(func.count()).select_from(MediaAsset)).scalar_one()
        assert n_assets == 0


def test_prioritization_only_no_legal_determination():
    # The Verdict carries a score + rationale — never a "guilty/illegal" verdict.
    v = FakeClassifier(["threat"]).classify("this is a threat")
    assert 0.0 <= v.score <= 1.0
    assert isinstance(v.rationale, str)
    assert not hasattr(v, "illegal") and not hasattr(v, "verdict")
