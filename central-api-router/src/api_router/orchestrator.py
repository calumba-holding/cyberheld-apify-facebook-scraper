from __future__ import annotations

import asyncio
import json
import os
import shlex
import socket
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4
from urllib.parse import quote

from .models import CreateJobRequest, JobRecord, Platform, SessionRecord
from .store import JobStore, now_iso


class DockerWorkerOrchestrator:
    def __init__(self, scraper_root: Path, store: JobStore, public_host: str = "127.0.0.1"):
        self.scraper_root = scraper_root
        self.store = store
        self.public_host = public_host
        self.host_root = Path(os.environ.get("SCRAPER_HOST_ROOT", str(scraper_root)))
        self.compose_command = shlex.split(os.environ.get("DOCKER_COMPOSE_COMMAND", "docker compose"))
        self._leases: dict[int, str] = {
            job.worker: job.job_id
            for job in store.list()
            if job.status in {"queued", "needs_authentication", "running", "watching"}
        }
        self._tasks: dict[str, asyncio.Task[None]] = {}

    async def recover_pending_jobs(self) -> None:
        self.reconcile_legacy_partial_jobs()
        self.reconcile_running_jobs()
        self.reconcile_watch_jobs()
        for job in self.store.list():
            if job.status == "queued":
                self.start(job.job_id)

    def _profile_root(self, worker: int) -> Path:
        return self.scraper_root / "docker" / "profiles" / f"worker-{worker}"

    def _cookie_db(self, worker: int, platform: Platform = "facebook") -> Path:
        return self._profile_root(worker) / platform / "Default" / "Cookies"

    def _login_url(self, worker: int) -> str:
        record = next((item for item in self.store.list_workers() if item.worker == worker), None)
        port = record.novnc_port if record else 6080 + worker
        return f"http://{self.public_host}:{port}/vnc.html?path=websockify&autoconnect=1&resize=scale"

    def create_worker(self, label: str | None = None):
        record = self.store.create_worker(label)
        (self.scraper_root / "docker" / "profiles" / f"worker-{record.worker}").mkdir(parents=True, exist_ok=True)
        (self.scraper_root / "docker" / "artifacts" / f"worker-{record.worker}").mkdir(parents=True, exist_ok=True)
        return record

    async def start_worker_authentication(self, worker: int, platform: Platform = "facebook") -> dict[str, Any]:
        if worker not in {record.worker for record in self.store.list_workers()}:
            raise RuntimeError(f"worker-{worker} is not registered")
        if worker in self._leases:
            raise RuntimeError(f"worker-{worker} is leased by job {self._leases[worker]}")
        name = f"{platform[:2]}-worker-auth-{worker}"
        # Facebook and Instagram share one noVNC port per worker. Replacing the
        # visible platform container preserves both profiles while preventing a
        # stale auth browser from holding the worker's host port.
        for candidate in (f"fa-worker-auth-{worker}", f"in-worker-auth-{worker}"):
            await self._remove_container_if_present(candidate)
        self._clear_stale_profile_locks(worker, platform)
        if worker <= 5:
            command = [
                *self.compose_command, "run", "-d", "--name", name, "--service-ports",
                "-e", "SCRAPE_LOGIN_AUTO_WAIT_SECS=3600", "-e", f"SCRAPE_TARGET={platform}",
                f"fb-worker-{worker}", "login",
            ]
        else:
            command = self._dynamic_worker_command(worker, name, detach=True) + [
                "-e", "SCRAPE_LOGIN_AUTO_WAIT_SECS=3600", "-e", f"SCRAPE_TARGET={platform}",
                "fb-worker-1", "login",
            ]
        code, _, stderr = await self._run(*command, timeout=120)
        if code != 0:
            raise RuntimeError(stderr[-2000:] or "could not start worker authentication")
        await self._wait_for_login_browser(name)
        return {"worker": worker, "platform": platform, "status": "authentication_started", "live_url": self._login_url(worker)}

    async def _wait_for_login_browser(self, container_name: str, timeout_seconds: int = 30) -> None:
        deadline = asyncio.get_running_loop().time() + timeout_seconds
        while asyncio.get_running_loop().time() < deadline:
            state = self._container_state(container_name)
            logs = self._container_logs(container_name, 120, timestamps=False)
            browser_launched = (
                "Opened persistent profile" in logs
                or "Launching persistent Chrome profile" in logs
            )
            if state.get("Running") is True and browser_launched:
                return
            if state and state.get("Running") is False:
                detail = logs[-2000:].strip() or f"{container_name} exited before Chrome became ready"
                raise RuntimeError(detail)
            await asyncio.sleep(0.5)
        raise RuntimeError(f"{container_name} did not open Chrome within {timeout_seconds} seconds")

    async def finish_worker_authentication(self, worker: int, platform: Platform = "facebook") -> dict[str, Any]:
        await self._remove_container_if_present(f"{platform[:2]}-worker-auth-{worker}")
        authenticated, reason = self.is_authenticated(worker, platform)
        return {
            "worker": worker,
            "platform": platform,
            "authenticated": authenticated,
            "status": "available" if authenticated else "login_required",
            "reason": reason,
            "live_url": self._login_url(worker),
        }

    def _clear_stale_profile_locks(self, worker: int, platform: Platform = "facebook") -> None:
        profile = self._profile_root(worker) / platform
        for name in ("SingletonLock", "SingletonSocket", "SingletonCookie"):
            try:
                (profile / name).unlink()
            except FileNotFoundError:
                pass

    def is_authenticated(self, worker: int, platform: Platform = "facebook") -> tuple[bool, str | None]:
        db = self._cookie_db(worker, platform)
        if not db.exists():
            return False, "no cookie store"
        try:
            with sqlite3.connect(f"file:{db}?mode=ro", uri=True) as connection:
                if platform == "instagram":
                    rows = connection.execute(
                        "SELECT DISTINCT name FROM cookies WHERE name IN ('sessionid','ds_user_id') "
                        "AND host_key LIKE '%instagram.com'",
                    ).fetchall()
                else:
                    rows = connection.execute(
                        "SELECT DISTINCT name FROM cookies WHERE name IN ('c_user','xs') "
                        "AND host_key LIKE '%facebook.com'",
                    ).fetchall()
            present = {row[0] for row in rows}
            required = {"sessionid", "ds_user_id"} if platform == "instagram" else {"c_user", "xs"}
            return required.issubset(present), None
        except sqlite3.Error as error:
            return False, str(error)

    def sessions(self) -> list[SessionRecord]:
        self.reconcile_running_jobs()
        self.reconcile_watch_jobs()
        sessions: list[SessionRecord] = []
        for worker_record in self.store.list_workers():
            worker = worker_record.worker
            for platform in ("facebook", "instagram"):
                authenticated, reason = self.is_authenticated(worker, platform)
                leased_by = self._leases.get(worker)
                sessions.append(SessionRecord(
                    worker=worker,
                    platform=platform,
                    authenticated=authenticated,
                    state="leased" if leased_by else ("available" if authenticated else "login_required"),
                    login_url=self._login_url(worker),
                    leased_by=leased_by,
                    reason=reason,
                ))
        return sessions

    def reconcile_running_jobs(self) -> None:
        for job in self.store.list():
            if job.status != "running":
                continue
            local_task = self._tasks.get(job.job_id)
            if local_task is not None and not local_task.done():
                continue
            container_name = f"fb-job-{job.job_id[:8]}"
            state = self._container_state(container_name)
            if state.get("Running") is True:
                continue
            if not state:
                persisted_result = self.store.load_result(job.job_id)
                if persisted_result is not None:
                    outcome = self._result_status(persisted_result)
                    self.store.update(
                        job.job_id,
                        status=outcome,
                        result_path=str(self.store.result_file(job.job_id)),
                        error=None,
                        partial_reason=self._partial_reason(persisted_result),
                    )
                    self._release_lease(job.worker, job.job_id)
                    continue
                try:
                    running_age_seconds = (datetime.now(timezone.utc) - datetime.fromisoformat(job.updated_at)).total_seconds()
                except ValueError:
                    running_age_seconds = 999
                if running_age_seconds < 45:
                    continue
                self.store.update(
                    job.job_id,
                    status="failed",
                    error="Job container disappeared before its result was persisted",
                )
                self._release_lease(job.worker, job.job_id)
                continue
            logs = self._container_logs(container_name, 50000, stderr=False, timestamps=False)
            result = self._parse_result(logs)
            exit_code = state.get("ExitCode")
            if exit_code == 0 and result is not None:
                result_path = self.store.save_result(job.job_id, result)
                outcome = self._result_status(result)
                self.store.update(
                    job.job_id,
                    status=outcome,
                    result_path=str(result_path),
                    error=None,
                    partial_reason=self._partial_reason(result),
                )
            else:
                self.store.update(
                    job.job_id,
                    status="failed",
                    error=f"Job container exited with code {exit_code if exit_code is not None else 'unknown'} before a valid result was recovered",
                )
            self._release_lease(job.worker, job.job_id)
            try:
                self._remove_container(container_name)
            except Exception:
                pass

    def reconcile_partial_reasons(self) -> None:
        for job in self.store.list():
            if job.status not in {"partial", "succeeded"} or job.partial_reason or not job.result_path:
                continue
            result = self.store.load_result(job.job_id)
            if result is None:
                continue
            self.store.update(job.job_id, partial_reason=self._partial_reason(result))

    def reconcile_legacy_partial_jobs(self) -> None:
        for job in self.store.list():
            if job.status != "partial":
                continue
            result = self.store.load_result(job.job_id)
            self.store.update(
                job.job_id,
                status="succeeded",
                partial_reason=job.partial_reason or (self._partial_reason(result) if result else None),
                partial_accepted=True,
                partial_accepted_at=job.partial_accepted_at or now_iso(),
            )

    def reconcile_watch_jobs(self) -> None:
        for job in self.store.list():
            if job.status != "watching" or not job.watch_id:
                continue
            state = self._container_state(f"fb-watch-{job.watch_id[:8]}")
            if state.get("Running") is True:
                continue
            exit_code = state.get("ExitCode", "unknown")
            self.store.update(
                job.job_id,
                status="failed",
                error=f"Watch container stopped unexpectedly (exit code {exit_code})",
            )
            self._release_lease(job.worker, job.job_id)

    def create_job(self, request: CreateJobRequest) -> JobRecord:
        platform = request.platform or request.detected_platform()
        worker = self._select_worker(request.worker, platform)
        job_id = str(uuid4())
        timestamp = now_iso()
        authenticated, _ = self.is_authenticated(worker, platform)
        record = JobRecord(
            job_id=job_id,
            status="queued" if authenticated else "needs_authentication",
            platform=platform,
            target_url=str(request.target_url),
            scraper=request.scraper,
            continue_watching=request.continue_watching,
            worker=worker,
            max_posts=request.max_posts,
            poll_interval_seconds=request.poll_interval_seconds,
            created_at=timestamp,
            updated_at=timestamp,
            login_url=None if authenticated else self._login_url(worker),
        )
        self.store.create(record)
        self._leases[worker] = job_id
        if authenticated:
            self.start(job_id)
        return record

    async def restart_job(self, job_id: str) -> JobRecord:
        job = self._require(job_id)
        if job.status not in {"failed", "cancelled"}:
            raise RuntimeError(f"job is {job.status}; only failed or cancelled jobs can be resumed")
        leased_by = self._leases.get(job.worker)
        if leased_by and leased_by != job.job_id:
            raise RuntimeError(f"worker-{job.worker} is already leased by job {leased_by}")
        for name in (f"fb-login-{job.job_id[:8]}", f"fb-job-{job.job_id[:8]}"):
            await self._remove_container_if_present(name)
        if job.watch_id:
            await self._remove_container_if_present(f"fb-watch-{job.watch_id[:8]}")
        previous_task = self._tasks.pop(job.job_id, None)
        if previous_task and not previous_task.done():
            previous_task.cancel()
        self.store.archive_result(job.job_id)
        authenticated, _ = self.is_authenticated(job.worker, job.platform)
        status = "queued" if authenticated else "needs_authentication"
        updated = self.store.update(
            job.job_id,
            status=status,
            login_url=None if authenticated else self._login_url(job.worker),
            result_path=None,
            watch_id=None,
            error=None,
            partial_reason=None,
            partial_accepted=False,
            partial_accepted_at=None,
        )
        self._leases[job.worker] = job.job_id
        if authenticated:
            self.start(job.job_id)
        return updated

    async def start_authentication(self, job_id: str) -> JobRecord:
        job = self._require(job_id)
        if job.status != "needs_authentication":
            raise RuntimeError(f"job is {job.status}, not needs_authentication")
        authenticated, _ = self.is_authenticated(job.worker, job.platform)
        if authenticated:
            return job
        name = f"fb-login-{job.job_id[:8]}"
        await self._remove_container_if_present(name)
        await self._start_login(job)
        return self.store.update(job_id, login_url=self._login_url(job.worker), error=None)

    def authentication_status(self, job_id: str) -> dict[str, Any]:
        job = self._require(job_id)
        authenticated, reason = self.is_authenticated(job.worker, job.platform)
        return {
            "job_id": job.job_id,
            "worker": job.worker,
            "authenticated": authenticated,
            "status": "authenticated" if authenticated else "authentication_required",
            "login_url": job.login_url,
            "reason": reason,
        }

    def job_logs(self, job_id: str, tail: int = 200) -> dict[str, Any]:
        job = self._require(job_id)
        candidates = []
        if job.status == "needs_authentication":
            candidates.append(f"fb-login-{job.job_id[:8]}")
        if job.watch_id:
            candidates.append(f"fb-watch-{job.watch_id[:8]}")
        candidates.append(f"fb-job-{job.job_id[:8]}")
        for container_name in candidates:
            state = self._container_state(container_name)
            if state:
                return {
                    "job_id": job_id,
                    "container": container_name,
                    "running": state.get("Running", False),
                    "exit_code": state.get("ExitCode"),
                    "logs": self._container_logs(container_name, tail),
                }
        return {"job_id": job_id, "container": None, "running": False, "exit_code": None, "logs": ""}

    def _select_worker(self, requested: int | None, platform: Platform = "facebook") -> int:
        if requested is not None:
            if requested not in {record.worker for record in self.store.list_workers()}:
                raise RuntimeError(f"worker-{requested} is not registered")
            if requested in self._leases:
                raise RuntimeError(f"worker-{requested} is already leased")
            return requested
        sessions = [session for session in self.sessions() if session.platform == platform]
        available = [session.worker for session in sessions if session.state == "available"]
        if available:
            return available[0]
        unleased = [session.worker for session in sessions if session.state != "leased"]
        if unleased:
            return unleased[0]
        raise RuntimeError("no Docker worker is currently available")

    def _release_lease(self, worker: int, job_id: str) -> None:
        if self._leases.get(worker) == job_id:
            self._leases.pop(worker, None)

    async def _stop_worker_auth_browsers(self, worker: int) -> None:
        for name in (f"fa-worker-auth-{worker}", f"in-worker-auth-{worker}"):
            await self._remove_container_if_present(name)

    async def _run(self, *args: str, timeout: int | None = None) -> tuple[int, str, str]:
        try:
            process = await asyncio.create_subprocess_exec(
                *args,
                cwd=self.scraper_root,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
        except OSError as error:
            raise RuntimeError(f"Could not start {args[0]}: {error}") from error
        try:
            stdout, stderr = await asyncio.wait_for(process.communicate(), timeout=timeout)
        except TimeoutError:
            process.kill()
            await process.wait()
            raise
        return process.returncode or 0, stdout.decode(), stderr.decode()

    async def _start_login(self, job: JobRecord) -> None:
        name = f"fb-login-{job.job_id[:8]}"
        await self._remove_container_if_present(name)
        self._clear_stale_profile_locks(job.worker, job.platform)
        if job.worker <= 5:
            command = [
                *self.compose_command, "run", "-d", "--name", name, "--service-ports",
                "-e", "SCRAPE_LOGIN_AUTO_WAIT_SECS=3600", "-e", f"SCRAPE_TARGET={job.platform}",
                f"fb-worker-{job.worker}", "login",
            ]
        else:
            command = self._dynamic_worker_command(job.worker, name, detach=True) + [
                "-e", "SCRAPE_LOGIN_AUTO_WAIT_SECS=3600", "-e", f"SCRAPE_TARGET={job.platform}",
                "fb-worker-1", "login",
            ]
        code, _, stderr = await self._run(*command, timeout=120)
        if code != 0:
            raise RuntimeError(stderr[-2000:] or "could not start authentication container")
        await self._wait_for_login_browser(name)

    def _dynamic_worker_command(self, worker: int, name: str, *, detach: bool = False) -> list[str]:
        record = next(item for item in self.store.list_workers() if item.worker == worker)
        profile = self.host_root / "docker" / "profiles" / f"worker-{worker}"
        artifacts = self.host_root / "docker" / "artifacts" / f"worker-{worker}"
        command = [*self.compose_command, "run"]
        if detach:
            command.append("-d")
        else:
            command.append("-T")
        command.extend([
            "--name", name,
            "-p", f"{record.novnc_port}:6080",
            "-v", f"{profile}:/data/dynamic-profiles",
            "-v", f"{artifacts}:/data/dynamic-artifacts",
            "-e", "SCRAPE_PROFILE_ROOT_DIR=/data/dynamic-profiles",
            "-e", "SCRAPE_CHROME_EXECUTABLE=/usr/bin/google-chrome-stable",
            "-e", "SCRAPE_ARTIFACT_ROOT_DIR=/data/dynamic-artifacts",
        ])
        return command

    async def _resume_authenticated_job(self, job: JobRecord) -> JobRecord:
        await self._remove_login_container(job)
        updated = self.store.update(job.job_id, status="queued", login_url=None, error=None)
        self.start(job.job_id)
        return updated

    async def authentication_complete(self, job_id: str) -> JobRecord:
        job = self._require(job_id)
        if job.status != "needs_authentication":
            raise RuntimeError(f"job is {job.status}, not needs_authentication")
        authenticated, reason = self.is_authenticated(job.worker, job.platform)
        if not authenticated:
            raise RuntimeError(reason or "Facebook session is not authenticated yet")
        return await self._resume_authenticated_job(job)

    async def _remove_login_container(self, job: JobRecord) -> None:
        await asyncio.to_thread(self._remove_container, f"fb-login-{job.job_id[:8]}")

    async def _remove_container_if_present(self, name: str) -> None:
        await asyncio.to_thread(self._remove_container, name)

    @staticmethod
    def _remove_container(name: str) -> None:
        request_path = f"/containers/{quote(name, safe='')}?force=true"
        request = (
            f"DELETE {request_path} HTTP/1.1\r\n"
            "Host: docker\r\n"
            "Connection: close\r\n\r\n"
        ).encode()
        with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as client:
            client.settimeout(30)
            client.connect("/var/run/docker.sock")
            client.sendall(request)
            response = bytearray()
            while True:
                chunk = client.recv(8192)
                if not chunk:
                    break
                response.extend(chunk)
        status_line = bytes(response).split(b"\r\n", 1)[0]
        if b" 204 " not in status_line and b" 404 " not in status_line:
            raise RuntimeError(f"Docker could not remove {name}: {status_line.decode(errors='replace')}")

    @staticmethod
    def _container_state(name: str) -> dict[str, Any]:
        request_path = f"/containers/{quote(name, safe='')}/json"
        request = (
            f"GET {request_path} HTTP/1.1\r\n"
            "Host: docker\r\n"
            "Connection: close\r\n\r\n"
        ).encode()
        try:
            with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as client:
                client.settimeout(10)
                client.connect("/var/run/docker.sock")
                client.sendall(request)
                response = bytearray()
                while True:
                    chunk = client.recv(8192)
                    if not chunk:
                        break
                    response.extend(chunk)
        except OSError:
            return {}
        raw = bytes(response)
        status_line, _, remainder = raw.partition(b"\r\n")
        if b" 200 " not in status_line:
            return {}
        _, _, body = remainder.partition(b"\r\n\r\n")
        if b"transfer-encoding: chunked" in remainder[:512].lower():
            decoded = bytearray()
            while body:
                size_line, _, body = body.partition(b"\r\n")
                try:
                    size = int(size_line.split(b";", 1)[0], 16)
                except ValueError:
                    return {}
                if size == 0:
                    break
                decoded.extend(body[:size])
                body = body[size + 2:]
            body = bytes(decoded)
        try:
            payload = json.loads(body)
        except json.JSONDecodeError:
            return {}
        return payload.get("State") or {}

    @staticmethod
    def _container_logs(name: str, tail: int, *, stderr: bool = True, timestamps: bool = True) -> str:
        request_path = (
            f"/containers/{quote(name, safe='')}/logs"
            f"?stdout=true&stderr={'true' if stderr else 'false'}"
            f"&timestamps={'true' if timestamps else 'false'}&tail={max(1, min(tail, 50000))}"
        )
        request = (
            f"GET {request_path} HTTP/1.1\r\n"
            "Host: docker\r\n"
            "Connection: close\r\n\r\n"
        ).encode()
        try:
            with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as client:
                client.settimeout(15)
                client.connect("/var/run/docker.sock")
                client.sendall(request)
                response = bytearray()
                while True:
                    chunk = client.recv(65536)
                    if not chunk:
                        break
                    response.extend(chunk)
        except OSError:
            return ""
        raw = bytes(response)
        status_line, _, remainder = raw.partition(b"\r\n")
        if b" 200 " not in status_line:
            return ""
        headers, _, body = remainder.partition(b"\r\n\r\n")
        if b"transfer-encoding: chunked" in headers.lower():
            decoded = bytearray()
            while body:
                size_line, _, body = body.partition(b"\r\n")
                try:
                    size = int(size_line.split(b";", 1)[0], 16)
                except ValueError:
                    break
                if size == 0:
                    break
                decoded.extend(body[:size])
                body = body[size + 2:]
            body = bytes(decoded)
        output = bytearray()
        offset = 0
        while offset + 8 <= len(body) and body[offset] in (0, 1, 2):
            frame_size = int.from_bytes(body[offset + 4:offset + 8], "big")
            start = offset + 8
            end = start + frame_size
            if end > len(body):
                break
            output.extend(body[start:end])
            offset = end
        if output:
            body = bytes(output)
        return body.decode(errors="replace")

    def start(self, job_id: str) -> None:
        if job_id in self._tasks and not self._tasks[job_id].done():
            return
        self._tasks[job_id] = asyncio.create_task(self._execute(job_id))

    async def _execute(self, job_id: str) -> None:
        job = self._require(job_id)
        await self._stop_worker_auth_browsers(job.worker)
        self._clear_stale_profile_locks(job.worker, job.platform)
        self.store.update(job_id, status="running", error=None)
        if job.scraper in {"post-engagement", "reel-engagement"}:
            if job.worker <= 5:
                command = [
                    *self.compose_command, "run", "--name", f"fb-job-{job.job_id[:8]}", "--service-ports", "-T",
                    "-e", f"SCRAPE_TARGET={job.platform}",
                    "-e", f"SCRAPE_SCRAPER={job.scraper}",
                    f"fb-worker-{job.worker}", "scrape", job.target_url,
                ]
            else:
                command = self._dynamic_worker_command(job.worker, f"fb-job-{job.job_id[:8]}") + [
                    "-e", f"SCRAPE_TARGET={job.platform}",
                    "-e", f"SCRAPE_SCRAPER={job.scraper}",
                    "fb-worker-1", "scrape", job.target_url,
                ]
        else:
            if job.worker <= 5:
                command = [
                    *self.compose_command, "run", "--name", f"fb-job-{job.job_id[:8]}", "--service-ports", "-T",
                    "-e", f"SCRAPE_TARGET={job.platform}",
                    "-e", f"SCRAPE_MAX_POSTS={job.max_posts}",
                    f"fb-worker-{job.worker}", "profile", job.target_url,
                ]
            else:
                command = self._dynamic_worker_command(job.worker, f"fb-job-{job.job_id[:8]}") + [
                    "-e", f"SCRAPE_TARGET={job.platform}",
                    "-e", f"SCRAPE_MAX_POSTS={job.max_posts}",
                    "fb-worker-1", "profile", job.target_url,
                ]
        try:
            code, stdout, stderr = await self._run(*command, timeout=900)
            result = self._parse_result(stdout)
            if code != 0 or result is None:
                raise RuntimeError(stderr[-4000:] or "worker returned no JSON result")
            result_path = self.store.save_result(job_id, result)
            outcome = self._result_status(result)
            if job.continue_watching and job.scraper in {"post-engagement", "reel-engagement"} and outcome != "failed":
                watch_id = await self._start_watch(job)
                self.store.update(
                    job_id,
                    status="watching",
                    result_path=str(result_path),
                    watch_id=watch_id,
                    error=None,
                    partial_reason=self._partial_reason(result),
                )
            else:
                self.store.update(
                    job_id,
                    status=outcome,
                    result_path=str(result_path),
                    error=None,
                    partial_reason=self._partial_reason(result),
                )
                self._release_lease(job.worker, job.job_id)
            await self._remove_container_if_present(f"fb-job-{job.job_id[:8]}")
        except Exception as error:
            self.store.update(job_id, status="failed", error=str(error))
            self._release_lease(job.worker, job.job_id)
            await self._remove_container_if_present(f"fb-job-{job.job_id[:8]}")

    @staticmethod
    def _parse_result(stdout: str) -> dict[str, Any] | None:
        start = stdout.find("{")
        if start < 0:
            return None
        try:
            return json.loads(stdout[start:])
        except json.JSONDecodeError:
            return None

    @staticmethod
    def _result_status(result: dict[str, Any]) -> str:
        summary = result.get("summary")
        if isinstance(summary, dict):
            if summary.get("failed", 0):
                return "failed"
        return "succeeded"

    @staticmethod
    def _partial_reason(result: dict[str, Any]) -> str | None:
        summary = result.get("summary") or {}
        if not summary.get("partial", 0):
            return None
        item = (result.get("results") or [{}])[0]
        profile = item.get("profile") or {}
        requested = profile.get("requestedPostCount")
        extracted = profile.get("extractedPostCount")
        if isinstance(requested, int) and isinstance(extracted, int) and extracted < requested:
            return f"Facebook exposed {extracted} unique recent posts; {requested} were requested."
        completeness = item.get("completeness") or {}
        missing = [
            label for key, label in (
                ("allCommentsFilterApplied", "all-comments visibility"),
                ("commentsExtracted", "comment extraction"),
                ("postReactionsExtracted", "post reaction extraction"),
            ) if completeness.get(key) is False
        ]
        if missing:
            return f"Incomplete: {', '.join(missing)}."
        return "The scraper returned useful evidence but could not verify every requested completeness condition."

    async def _start_watch(self, job: JobRecord) -> str:
        watch_id = str(uuid4())
        config_path = self.store.watch_config_path(job.job_id)
        config = {
            "workerId": f"fb-worker-{job.worker}",
            "accountRef": f"worker-{job.worker}",
            "pollIntervalSeconds": job.poll_interval_seconds,
            "commentsOnly": True,
            "incident": {"gapSeconds": 120, "maxEvents": 50, "maxDurationSeconds": 600},
            "posts": [{"postUrl": job.target_url}],
        }
        config_path.write_text(json.dumps(config, indent=2) + "\n", encoding="utf-8")
        host_config_path = self.host_root / config_path.relative_to(self.scraper_root)
        if job.worker <= 5:
            command = [
                *self.compose_command, "run", "-d", "--name", f"fb-watch-{watch_id[:8]}", "--service-ports", "-T",
                "-v", f"{host_config_path}:/data/watch-config/worker.json:ro",
                f"fb-worker-{job.worker}", "watch",
            ]
        else:
            command = self._dynamic_worker_command(job.worker, f"fb-watch-{watch_id[:8]}", detach=True) + [
                "-v", f"{host_config_path}:/data/watch-config/worker.json:ro",
                "-e", "WATCH_CONFIG=/data/watch-config/worker.json",
                "fb-worker-1", "watch",
            ]
        code, _, stderr = await self._run(*command, timeout=120)
        if code != 0:
            raise RuntimeError(stderr[-2000:] or "could not start watch container")
        return watch_id

    async def stop_watch(self, job_id: str) -> JobRecord:
        job = self._require(job_id)
        if not job.watch_id:
            raise RuntimeError("job has no active watch")
        await asyncio.to_thread(self._remove_container, f"fb-watch-{job.watch_id[:8]}")
        self._release_lease(job.worker, job.job_id)
        return self.store.update(job_id, status="succeeded", watch_id=None)

    async def restart_watch(self, job_id: str) -> JobRecord:
        job = self._require(job_id)
        if not job.result_path:
            raise RuntimeError("initial scrape result is not available")
        if job.status in {"queued", "running", "needs_authentication"}:
            raise RuntimeError(f"job is {job.status}; watch cannot be restarted yet")
        authenticated, reason = self.is_authenticated(job.worker, job.platform)
        if not authenticated:
            raise RuntimeError(reason or "worker session is not authenticated")
        leased_by = self._leases.get(job.worker)
        if leased_by and leased_by != job.job_id:
            raise RuntimeError(f"worker-{job.worker} is already leased by job {leased_by}")
        if job.watch_id:
            await asyncio.to_thread(self._remove_container, f"fb-watch-{job.watch_id[:8]}")
        self._leases[job.worker] = job.job_id
        watch_id = await self._start_watch(job)
        return self.store.update(job_id, status="watching", watch_id=watch_id, error=None)

    async def cancel_job(self, job_id: str) -> JobRecord:
        job = self._require(job_id)
        if job.status in {"succeeded", "partial", "failed", "cancelled"}:
            raise RuntimeError(f"job is already {job.status}")
        task = self._tasks.get(job_id)
        if task and not task.done():
            task.cancel()
        names = [f"fb-login-{job.job_id[:8]}", f"fb-job-{job.job_id[:8]}"]
        if job.watch_id:
            names.append(f"fb-watch-{job.watch_id[:8]}")
        for name in names:
            try:
                await asyncio.to_thread(self._remove_container, name)
            except Exception:
                continue
        self._release_lease(job.worker, job.job_id)
        return self.store.update(
            job_id,
            status="cancelled",
            error="Cancelled by operator",
            login_url=None,
        )

    def watch_events(self, job_id: str) -> list[dict[str, Any]]:
        job = self._require(job_id)
        worker_root = (
            self.scraper_root / "docker" / "artifacts" / f"worker-{job.worker}"
            / "watch" / f"fb-worker-{job.worker}" / "events"
        )
        events: list[dict[str, Any]] = []
        if not worker_root.exists():
            return events
        for path in sorted(worker_root.glob("*/*.json")):
            try:
                events.append(json.loads(path.read_text(encoding="utf-8")))
            except (OSError, json.JSONDecodeError):
                continue
        return events

    def _require(self, job_id: str) -> JobRecord:
        job = self.store.get(job_id)
        if job is None:
            raise KeyError(job_id)
        return job