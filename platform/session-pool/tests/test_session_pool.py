"""Account & Session Pool tests (#43), against real Postgres."""

from __future__ import annotations

import pytest

from session_pool.engine import make_engine, make_session_factory, reset_schema
from session_pool.service import PoolExhausted, SessionPool


def test_register_and_capacity(pool):
    pool.register("facebook", "acct-1", "worker-1")
    pool.register("facebook", "acct-2", "worker-2")
    pool.s.commit()
    assert pool.capacity("facebook") == {"active": 2}


def test_profile_is_never_shared(pool):
    pool.register("facebook", "acct-1", "worker-1")
    pool.s.commit()
    with pytest.raises(Exception):  # UNIQUE(platform, profile_ref)
        pool.register("facebook", "acct-2", "worker-1")  # same profile, different account
        pool.s.flush()


def test_lease_marks_leased_and_binds_profile(pool):
    a = pool.register("instagram", "ig-1", "profile-A")
    pool.s.commit()
    leased = pool.lease("instagram", leased_by="job-123")
    pool.s.commit()
    assert leased.id == a.id
    assert leased.state == "leased"
    assert leased.leased_by == "job-123"
    assert leased.profile_ref == "profile-A"  # never swapped


def test_lease_exhaustion_is_raised(pool):
    pool.register("tiktok", "tt-1", "p1")
    pool.s.commit()
    pool.lease("tiktok", "job-1")
    pool.s.commit()
    with pytest.raises(PoolExhausted):
        pool.lease("tiktok", "job-2")  # only account is leased


def test_warning_quarantines_immediately(pool):
    a = pool.register("facebook", "fb-1", "p1")
    pool.s.commit()
    pool.report_warning(a.id)
    pool.s.commit()
    assert a.state == "quarantined"
    assert a.warnings == 1
    assert a.health_score == 50
    # quarantined account is not leasable
    with pytest.raises(PoolExhausted):
        pool.lease("facebook", "job-x")


def test_release_returns_to_active(pool):
    a = pool.register("facebook", "fb-1", "p1")
    pool.s.commit()
    pool.lease("facebook", "job-1")
    pool.s.commit()
    pool.release(a.id)
    pool.s.commit()
    assert a.state == "active"
    # leasable again
    again = pool.lease("facebook", "job-2")
    assert again.id == a.id


def test_lease_prefers_healthiest(pool):
    healthy = pool.register("facebook", "fb-healthy", "p1")
    weak = pool.register("facebook", "fb-weak", "p2")
    pool.s.commit()
    # knock down the weak one's health without quarantining (direct set for the test)
    weak.health_score = 40
    pool.s.commit()
    leased = pool.lease("facebook", "job-1")
    assert leased.id == healthy.id


def test_concurrent_lease_skips_locked(engine):
    """Two sessions leasing at once must get DIFFERENT accounts (FOR UPDATE SKIP LOCKED)."""
    reset_schema(engine)  # this test uses `engine` directly, not the per-test `session` fixture
    factory = make_session_factory(engine)
    # seed two accounts
    with factory() as seed:
        SessionPool(seed).register("facebook", "a1", "p1")
        SessionPool(seed).register("facebook", "a2", "p2")
        seed.commit()

    sa, sb = factory(), factory()
    try:
        a = SessionPool(sa).lease("facebook", "job-A")  # holds a1's row lock (uncommitted)
        b = SessionPool(sb).lease("facebook", "job-B")  # must skip a1, take a2
        assert a.id != b.id
        # a third concurrent lease finds nothing free -> exhausted
        sc = factory()
        try:
            with pytest.raises(PoolExhausted):
                SessionPool(sc).lease("facebook", "job-C")
        finally:
            sc.rollback()
            sc.close()
    finally:
        sa.rollback()
        sa.close()
        sb.rollback()
        sb.close()
