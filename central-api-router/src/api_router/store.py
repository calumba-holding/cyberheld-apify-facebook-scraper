from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from threading import RLock
from typing import Any

from .models import JobRecord, WorkerRecord


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class JobStore:
    """SQLite job metadata with file-backed scraper results and watch artifacts."""

    def __init__(self, root: Path):
        self.root = root
        self.jobs_dir = root / "jobs"
        self.database_path = root / "control-plane.sqlite3"
        self.jobs_dir.mkdir(parents=True, exist_ok=True)
        self._lock = RLock()
        self._initialize()

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.database_path, timeout=30)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA journal_mode=WAL")
        connection.execute("PRAGMA foreign_keys=ON")
        return connection

    def _initialize(self) -> None:
        with self._connect() as connection:
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS jobs (
                    job_id TEXT PRIMARY KEY,
                    status TEXT NOT NULL,
                    platform TEXT NOT NULL DEFAULT 'facebook',
                    target_url TEXT NOT NULL,
                    scraper TEXT NOT NULL,
                    continue_watching INTEGER NOT NULL,
                    worker INTEGER NOT NULL,
                    max_posts INTEGER NOT NULL,
                    poll_interval_seconds INTEGER NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    login_url TEXT,
                    result_path TEXT,
                    watch_id TEXT,
                    error TEXT,
                    partial_reason TEXT,
                    partial_accepted INTEGER NOT NULL DEFAULT 0,
                    partial_accepted_at TEXT
                )
                """,
            )
            connection.execute("CREATE INDEX IF NOT EXISTS jobs_created_at_idx ON jobs(created_at DESC)")
            connection.execute("CREATE INDEX IF NOT EXISTS jobs_status_idx ON jobs(status)")
            columns = {row[1] for row in connection.execute("PRAGMA table_info(jobs)").fetchall()}
            if "platform" not in columns:
                connection.execute("ALTER TABLE jobs ADD COLUMN platform TEXT NOT NULL DEFAULT 'facebook'")
            if "partial_reason" not in columns:
                connection.execute("ALTER TABLE jobs ADD COLUMN partial_reason TEXT")
            if "partial_accepted" not in columns:
                connection.execute("ALTER TABLE jobs ADD COLUMN partial_accepted INTEGER NOT NULL DEFAULT 0")
            if "partial_accepted_at" not in columns:
                connection.execute("ALTER TABLE jobs ADD COLUMN partial_accepted_at TEXT")
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS workers (
                    worker INTEGER PRIMARY KEY,
                    label TEXT NOT NULL,
                    novnc_port INTEGER NOT NULL UNIQUE,
                    created_at TEXT NOT NULL,
                    enabled INTEGER NOT NULL DEFAULT 1
                )
                """,
            )
            for worker in range(1, 6):
                connection.execute(
                    "INSERT OR IGNORE INTO workers (worker,label,novnc_port,created_at,enabled) VALUES (?,?,?,?,1)",
                    (worker, f"worker-{worker}", 6080 + worker, now_iso()),
                )

    def _job_dir(self, job_id: str) -> Path:
        return self.jobs_dir / job_id

    @staticmethod
    def _atomic_json(path: Path, value: Any) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        temporary = path.with_suffix(f"{path.suffix}.tmp")
        temporary.write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8")
        temporary.replace(path)

    @staticmethod
    def _from_row(row: sqlite3.Row) -> JobRecord:
        values = dict(row)
        values["continue_watching"] = bool(values["continue_watching"])
        values["partial_accepted"] = bool(values["partial_accepted"])
        return JobRecord.model_validate(values)

    def create(self, record: JobRecord) -> JobRecord:
        values = record.model_dump()
        values["continue_watching"] = int(record.continue_watching)
        values["partial_accepted"] = int(record.partial_accepted)
        columns = ", ".join(values)
        placeholders = ", ".join(f":{column}" for column in values)
        with self._lock, self._connect() as connection:
            connection.execute(f"INSERT INTO jobs ({columns}) VALUES ({placeholders})", values)
        return record

    def get(self, job_id: str) -> JobRecord | None:
        with self._lock, self._connect() as connection:
            row = connection.execute("SELECT * FROM jobs WHERE job_id = ?", (job_id,)).fetchone()
        return self._from_row(row) if row else None

    def update(self, job_id: str, **changes: Any) -> JobRecord:
        current = self.get(job_id)
        if current is None:
            raise KeyError(job_id)
        updated = current.model_copy(update={**changes, "updated_at": now_iso()})
        values = updated.model_dump()
        values["continue_watching"] = int(updated.continue_watching)
        values["partial_accepted"] = int(updated.partial_accepted)
        assignments = ", ".join(f"{column} = :{column}" for column in values if column != "job_id")
        with self._lock, self._connect() as connection:
            connection.execute(f"UPDATE jobs SET {assignments} WHERE job_id = :job_id", values)
        return updated

    def list(self) -> list[JobRecord]:
        with self._lock, self._connect() as connection:
            rows = connection.execute("SELECT * FROM jobs ORDER BY created_at DESC").fetchall()
        return [self._from_row(row) for row in rows]

    def save_result(self, job_id: str, result: dict[str, Any]) -> Path:
        path = self._job_dir(job_id) / "result.json"
        with self._lock:
            self._atomic_json(path, result)
        return path

    def load_result(self, job_id: str) -> dict[str, Any] | None:
        path = self.result_file(job_id)
        if not path.exists():
            return None
        return json.loads(path.read_text(encoding="utf-8"))

    def result_file(self, job_id: str) -> Path:
        return self._job_dir(job_id) / "result.json"

    def archive_result(self, job_id: str) -> Path | None:
        """Move the current result out of the active attempt slot before restart."""
        source = self.result_file(job_id)
        if not source.exists():
            return None
        archive_dir = self._job_dir(job_id) / "attempts"
        archive_dir.mkdir(parents=True, exist_ok=True)
        stamp = now_iso().replace(":", "-")
        destination = archive_dir / f"result-{stamp}.json"
        with self._lock:
            source.replace(destination)
        return destination

    def watch_config_path(self, job_id: str) -> Path:
        path = self._job_dir(job_id) / "watch-config.json"
        path.parent.mkdir(parents=True, exist_ok=True)
        return path

    def list_workers(self) -> list[WorkerRecord]:
        with self._lock, self._connect() as connection:
            rows = connection.execute("SELECT * FROM workers WHERE enabled=1 ORDER BY worker").fetchall()
        return [WorkerRecord(
            worker=row["worker"], label=row["label"], novnc_port=row["novnc_port"],
            created_at=row["created_at"], enabled=bool(row["enabled"]),
        ) for row in rows]

    def create_worker(self, label: str | None = None) -> WorkerRecord:
        with self._lock, self._connect() as connection:
            next_worker = int(connection.execute("SELECT COALESCE(MAX(worker),0)+1 FROM workers").fetchone()[0])
            record = WorkerRecord(
                worker=next_worker,
                label=label or f"worker-{next_worker}",
                novnc_port=6080 + next_worker,
                created_at=now_iso(),
            )
            connection.execute(
                "INSERT INTO workers (worker,label,novnc_port,created_at,enabled) VALUES (?,?,?,?,1)",
                (record.worker, record.label, record.novnc_port, record.created_at),
            )
        return record
