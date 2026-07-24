"""Behavioral tests for the Metadata DB (issue #33).

These run against a real Postgres (the schema's triggers/constraints are the point,
so SQLite would not exercise them). conftest resets the schema per test.
"""

from __future__ import annotations

import pytest
from sqlalchemy import delete
from sqlalchemy.exc import DBAPIError, IntegrityError

from metadata_db.models import JobStep


def _job(repo):
    case = repo.open_case(external_ref="CASE-1")
    job = repo.create_job(case.id, job_type="fb/post", target_url="https://fb.com/x")
    return case, job


# --- happy path: the before/after custody write pattern --------------------
def test_custody_flow_orders_and_ticks_off(repo):
    _, job = _job(repo)
    repo.start_step(job.id, 1, "launch")
    repo.start_step(job.id, 2, "capture")
    repo.finish_step(job.id, 1, "succeeded", detail={"ms": 812})
    repo.s.commit()

    log = repo.custody_log(job.id)
    assert [s.step_index for s in log] == [1, 2]
    assert log[0].state == "succeeded" and log[0].finished_at is not None
    assert log[1].state == "started" and log[1].finished_at is None
    assert log[0].detail == {"ms": 812}


# --- custody integrity (DB triggers, not convention) -----------------------
def test_step_delete_is_blocked(repo):
    _, job = _job(repo)
    repo.start_step(job.id, 1, "launch")
    repo.s.commit()
    with pytest.raises(DBAPIError, match="append-only"):
        repo.s.execute(delete(JobStep).where(JobStep.job_id == job.id))
        repo.s.flush()


def test_step_rename_is_blocked(repo):
    _, job = _job(repo)
    step = repo.start_step(job.id, 1, "launch")
    repo.s.commit()
    with pytest.raises(DBAPIError, match="append-only"):
        step.name = "tampered"
        repo.s.flush()


def test_step_reorder_is_blocked(repo):
    _, job = _job(repo)
    step = repo.start_step(job.id, 1, "launch")
    repo.s.commit()
    with pytest.raises(DBAPIError, match="append-only"):
        step.step_index = 9
        repo.s.flush()


def test_terminal_step_state_is_immutable(repo):
    _, job = _job(repo)
    repo.start_step(job.id, 1, "launch")
    repo.finish_step(job.id, 1, "succeeded")
    repo.s.commit()
    with pytest.raises(DBAPIError, match="terminal"):
        repo.finish_step(job.id, 1, "failed")
        repo.s.flush()


def test_duplicate_step_index_is_rejected(repo):
    _, job = _job(repo)
    repo.start_step(job.id, 1, "launch")
    repo.s.commit()
    with pytest.raises(IntegrityError):
        repo.start_step(job.id, 1, "dup")
        repo.s.flush()


# --- hashes 1:1 with media_assets ------------------------------------------
def test_hash_is_one_to_one_with_asset(repo):
    _, job = _job(repo)
    asset = repo.add_media_asset(job.id, kind="screenshot", object_key=f"c/{job.id}/a.png")
    repo.record_hash(asset.id, digest="abc123")
    repo.s.commit()
    with pytest.raises(IntegrityError):
        repo.record_hash(asset.id, digest="def456")
        repo.s.flush()


# --- entities: handles only, unique per platform ---------------------------
def test_entity_upsert_is_idempotent(repo):
    e1 = repo.upsert_entity("facebook", "@bob", display_name="Bob")
    e2 = repo.upsert_entity("facebook", "@bob", display_name="Bobby")
    repo.s.commit()
    assert e1.id == e2.id
    assert e2.display_name == "Bobby"


def test_same_handle_different_platform_is_distinct(repo):
    fb = repo.upsert_entity("facebook", "@bob")
    ig = repo.upsert_entity("instagram", "@bob")
    repo.s.commit()
    assert fb.id != ig.id


# --- FK integrity -----------------------------------------------------------
def test_content_item_links_job_and_entity(repo):
    _, job = _job(repo)
    ent = repo.upsert_entity("facebook", "@alice")
    item = repo.add_content_item(
        job.id, platform="facebook", item_type="post",
        source_url="https://fb.com/p/1", entity_id=ent.id, payload={"likes": 3},
    )
    repo.s.commit()
    assert item.entity_id == ent.id
    assert item.payload == {"likes": 3}
