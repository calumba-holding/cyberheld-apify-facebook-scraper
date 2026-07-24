"""Account & Session Pool service (#43).

A health-scored pool of authenticated accounts. Leasing is atomic — two workers
can never hold the same account (Postgres FOR UPDATE SKIP LOCKED) — and the 1↔1
account/profile binding is fixed for an account's life. A single warning quarantines
an account rather than running it until banned; attrition is expected, so exhaustion
is reported (raised), never silently retried.
"""

from __future__ import annotations

import uuid

from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from .models import Account

WARNING_PENALTY = 50


class PoolExhausted(RuntimeError):
    """No healthy account available for the requested platform."""


class SessionPool:
    def __init__(self, session: Session) -> None:
        self.s = session

    # --- inventory ------------------------------------------------------
    def register(self, platform: str, account_ref: str, profile_ref: str) -> Account:
        account = Account(platform=platform, account_ref=account_ref, profile_ref=profile_ref)
        self.s.add(account)
        self.s.flush()
        return account

    def capacity(self, platform: str | None = None) -> dict[str, int]:
        stmt = select(Account.state, func.count()).group_by(Account.state)
        if platform:
            stmt = stmt.where(Account.platform == platform)
        return {state: n for state, n in self.s.execute(stmt).all()}

    # --- lease / release ------------------------------------------------
    def lease(self, platform: str, leased_by: str) -> Account:
        """Atomically claim the healthiest active account for a platform.

        FOR UPDATE SKIP LOCKED: a row another transaction is leasing is skipped, so
        concurrent leases get distinct accounts and never block on each other.
        """
        row = self.s.execute(
            text(
                "SELECT id FROM accounts "
                "WHERE platform = :platform AND state = 'active' "
                "ORDER BY health_score DESC, last_used_at ASC NULLS FIRST "
                "FOR UPDATE SKIP LOCKED LIMIT 1"
            ),
            {"platform": platform},
        ).first()
        if row is None:
            raise PoolExhausted(f"no healthy account available for {platform}")
        account = self.s.get(Account, row.id)
        account.state = "leased"
        account.leased_by = leased_by
        account.leased_at = func.now()
        account.last_used_at = func.now()
        self.s.flush()
        return account

    def release(self, account_id: uuid.UUID) -> Account:
        account = self._get(account_id)
        if account.state == "leased":
            account.state = "active"
            account.leased_by = None
            account.leased_at = None
            self.s.flush()
        return account

    # --- health ---------------------------------------------------------
    def report_warning(self, account_id: uuid.UUID, penalty: int = WARNING_PENALTY) -> Account:
        """Quarantine on the FIRST warning; not leasable until cleared/retired."""
        account = self._get(account_id)
        account.warnings += 1
        account.health_score = max(0, account.health_score - penalty)
        account.state = "quarantined"
        account.leased_by = None
        account.leased_at = None
        self.s.flush()
        return account

    def retire(self, account_id: uuid.UUID) -> Account:
        account = self._get(account_id)
        account.state = "retired"
        self.s.flush()
        return account

    def clear_quarantine(self, account_id: uuid.UUID) -> Account:
        account = self._get(account_id)
        if account.state == "quarantined":
            account.state = "active"
            self.s.flush()
        return account

    def _get(self, account_id: uuid.UUID) -> Account:
        account = self.s.get(Account, account_id)
        if account is None:
            raise LookupError(f"account {account_id} not found")
        return account
