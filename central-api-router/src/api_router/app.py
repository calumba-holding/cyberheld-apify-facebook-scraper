"""API Gateway — the central router.

Exactly the diagram: one gateway that routes four paths to four separate scraper
services, each its own docker container exposing a single API. The gateway forwards
the request to the scraper's API and returns its response. It scrapes nothing, stores
nothing, and has no jobs.

    /facebook/watch       -> API Facebook Watch       (docker: watch-posting)
    /facebook/screenshot  -> API Facebook Screenshot  (docker: screenshot)
    /instagram/screenshot -> API Instagram Screenshot (docker: screenshot)
    /facebook/comments    -> API Facebook Comments    (docker: comments-scraper)
"""

from __future__ import annotations

import os
from pathlib import Path
from urllib.parse import urlparse

import httpx
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse

from .models import CreateJobRequest, CreateWorkerRequest, Platform
from .orchestrator import DockerWorkerOrchestrator
from .services import SCRAPER_ENDPOINT, SERVICES, SESSION_SUB_API, ScraperService
from .store import JobStore

VERSION = "1.0.0"


def _api_base() -> str:
    return os.environ.get("PUBLIC_API_URL", "http://127.0.0.1:8080").rstrip("/")


def _job_response(job) -> dict:
    body = job.model_dump()
    body["action"] = (
        "profile" if job.scraper == "profile-scraper"
        else "watch" if job.continue_watching
        else "scrape"
    )
    parsed_target = urlparse(job.target_url)
    path = parsed_target.path.lower()
    query = parsed_target.query
    if job.platform == "instagram":
        body["content_type"] = (
            "reel" if any(path.startswith(prefix) for prefix in ("/reel/", "/reels/", "/tv/"))
            else "post" if path.startswith("/p/")
            else "profile"
        )
    else:
        body["content_type"] = (
            "reel" if path.startswith("/reel/")
            else "video" if ((path.startswith("/watch") and "v=" in query) or "/videos/" in path)
            else "post" if any(token in path for token in ("/posts/", "/permalink/", "/share/p/", "/share/v/", "/story.php", "/photo.php"))
            else "profile"
        )
    body["selected_scraper"] = job.scraper
    body["live_url"] = (
        f"http://{os.environ.get('PUBLIC_HOST', '127.0.0.1')}:{6080 + job.worker}"
        "/vnc.html?path=websockify&autoconnect=1&resize=scale"
        if job.status in {"needs_authentication", "queued", "running", "watching"}
        else None
    )
    base = _api_base()
    if job.status == "needs_authentication":
        body["next_actions"] = {
            "start_authentication": f"curl -sS -X POST {base}/v1/jobs/{job.job_id}/authentication/start | jq",
            "check_authentication": f"curl -sS {base}/v1/jobs/{job.job_id}/authentication | jq",
            "resume_job": f"curl -sS -X POST {base}/v1/jobs/{job.job_id}/authentication-complete | jq",
            "cancel_job": f"curl -sS -X POST {base}/v1/jobs/{job.job_id}/cancel | jq",
        }
    elif job.status in {"queued", "running", "watching"}:
        body["next_actions"] = {
            "check_job": f"curl -sS {base}/v1/jobs/{job.job_id} | jq",
            "get_result": f"curl -sS {base}/v1/jobs/{job.job_id}/result | jq",
        }
        if job.status == "watching":
            body["next_actions"]["stop_watch"] = f"curl -sS -X DELETE {base}/v1/jobs/{job.job_id}/watch | jq"
        body["next_actions"]["cancel_job"] = f"curl -sS -X POST {base}/v1/jobs/{job.job_id}/cancel | jq"
    else:
        body["next_actions"] = {
            "download_result": f"curl -sS {base}/v1/jobs/{job.job_id}/result/download --output {job.job_id}-result.json",
            "get_summary": f"curl -sS {base}/v1/jobs/{job.job_id}/result/summary | jq",
        }
        if job.continue_watching and job.result_path:
            body["next_actions"]["restart_watch"] = f"curl -sS -X POST {base}/v1/jobs/{job.job_id}/watch/restart | jq"
        if job.status in {"failed", "cancelled"}:
            body["next_actions"]["resume_job"] = f"curl -sS -X POST {base}/v1/jobs/{job.job_id}/restart | jq"
    if job.result_path:
        body["result_url"] = f"{base}/v1/jobs/{job.job_id}/result"
        body["download_url"] = f"{base}/v1/jobs/{job.job_id}/result/download"
        body["summary_url"] = f"{base}/v1/jobs/{job.job_id}/result/summary"
        body["suggested_output_file"] = f"{job.job_id}-result.json"
    return body


def _make_handler(svc: ScraperService):
    async def handler(request: Request):
        # forward the incoming body to the scraper service's single API
        try:
            payload = await request.json()
        except Exception:
            payload = {}
        target = f"{svc.url}{SCRAPER_ENDPOINT}"
        try:
            async with httpx.AsyncClient(timeout=300) as client:
                resp = await client.post(target, json=payload)
            return JSONResponse(
                content=_safe_json(resp), status_code=resp.status_code,
            )
        except httpx.RequestError:
            return JSONResponse(
                status_code=502,
                content={
                    "error": "scraper_unavailable",
                    "service": svc.name,
                    "container": svc.container,
                    "url": target,
                },
            )

    return handler


def _safe_json(resp: httpx.Response):
    try:
        return resp.json()
    except Exception:
        return {"raw": resp.text}


def create_app(
    *,
    store: JobStore | None = None,
    orchestrator: DockerWorkerOrchestrator | None = None,
) -> FastAPI:
    scraper_root = Path(os.environ.get("SCRAPER_ROOT", Path(__file__).resolve().parents[3]))
    job_store = store or JobStore(Path(os.environ.get("JOB_STORE_DIR", scraper_root / "runs" / "api")))
    worker_orchestrator = orchestrator or DockerWorkerOrchestrator(
        scraper_root,
        job_store,
        os.environ.get("PUBLIC_HOST", "127.0.0.1"),
    )
    app = FastAPI(
        title="Evidence Control API",
        version=VERSION,
        summary="Docker-backed Facebook and Instagram workers, sessions, jobs, watches, and evidence results.",
        description="""
## Workflow

1. List or create persistent workers with `/v1/workers`.
2. Create a job with `POST /v1/jobs` and a Facebook or Instagram URL.
3. The API detects profile/post/video/reel and selects the scraper.
4. If `needs_authentication`, start authentication, open `live_url`, then resume.
5. Poll the job or inspect real-time logs.
6. Download the completed JSON result. Facebook post jobs can optionally continue watching for new comments.

## Job examples

- Instagram reel: `{"platform":"instagram","action":"scrape","target_url":"https://www.instagram.com/reel/SHORTCODE/","worker":1}`
- Instagram profile: `{"platform":"instagram","action":"profile","target_url":"https://www.instagram.com/USERNAME/","worker":1,"max_posts":20}`
- Facebook post: `{"platform":"facebook","action":"scrape","target_url":"FACEBOOK_POST_URL","worker":1}`
- Facebook watch: `{"platform":"facebook","action":"watch","target_url":"FACEBOOK_POST_URL","worker":1}`

Swagger examples are executable from this page. The same operations remain available through curl and the Next.js dashboard.
""",
        openapi_tags=[
            {"name": "workers", "description": "Persistent Chrome identity slots and noVNC monitors."},
            {"name": "jobs", "description": "Create, monitor, cancel, resume, download, and watch capture jobs."},
            {"name": "sessions", "description": "Facebook and Instagram authentication lifecycle for persistent worker profiles."},
            {"name": "meta", "description": "Health and service discovery."},
            {"name": "gateway", "description": "Legacy scraper-service proxy routes."},
        ],
    )
    app.state.job_store = job_store
    app.state.orchestrator = worker_orchestrator

    @app.on_event("startup")
    async def recover_pending_jobs() -> None:
        await worker_orchestrator.recover_pending_jobs()
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[origin.strip() for origin in os.environ.get("DASHBOARD_ORIGINS", "http://127.0.0.1:3100,http://localhost:3100").split(",")],
        allow_credentials=False,
        allow_methods=["GET", "POST", "DELETE"],
        allow_headers=["Content-Type"],
    )

    # the four routes -> four scraper services
    for svc in SERVICES:
        app.add_api_route(
            svc.route, _make_handler(svc), methods=["POST"],
            name=svc.name, tags=["gateway"],
        )

    @app.get("/health", tags=["meta"])
    async def health() -> dict:
        return {"status": "ok", "jobs": len(job_store.list()), "sessions": len(worker_orchestrator.sessions())}

    @app.get("/v1/sessions", tags=["sessions"])
    async def sessions() -> dict:
        return {"sessions": [session.model_dump() for session in worker_orchestrator.sessions()]}

    @app.get("/v1/workers", tags=["workers"], summary="List persistent workers")
    async def list_workers() -> dict:
        sessions_by_worker = {
            (session.worker, session.platform): session
            for session in worker_orchestrator.sessions()
        }
        return {"workers": [
            {
                **worker.model_dump(),
                **sessions_by_worker[(worker.worker, "facebook")].model_dump(),
                "sessions": {
                    platform: sessions_by_worker[(worker.worker, platform)].model_dump()
                    for platform in ("facebook", "instagram")
                },
                "live_url": sessions_by_worker[(worker.worker, "facebook")].login_url,
            }
            for worker in job_store.list_workers()
        ]}

    @app.post("/v1/workers", status_code=201, tags=["workers"], summary="Add a persistent local worker")
    async def create_worker(payload: CreateWorkerRequest) -> dict:
        worker = worker_orchestrator.create_worker(payload.label)
        return {
            **worker.model_dump(),
            "authenticated": False,
            "state": "login_required",
            "live_url": f"http://{os.environ.get('PUBLIC_HOST', '127.0.0.1')}:{worker.novnc_port}/vnc.html?path=websockify&autoconnect=1&resize=scale",
        }

    @app.post("/v1/workers/{worker}/authentication/start", tags=["workers"], summary="Open worker authentication browser")
    async def start_worker_authentication(worker: int, platform: Platform = "facebook") -> dict:
        try:
            return await worker_orchestrator.start_worker_authentication(worker, platform)
        except RuntimeError as error:
            raise HTTPException(status_code=409, detail=str(error)) from error

    @app.post("/v1/workers/{worker}/authentication/finish", tags=["workers"], summary="Close login browser and verify worker session")
    async def finish_worker_authentication(worker: int, platform: Platform = "facebook") -> dict:
        return await worker_orchestrator.finish_worker_authentication(worker, platform)

    @app.post(
        "/v1/jobs", status_code=202, tags=["jobs"], summary="Create a Facebook or Instagram capture job",
        description="Infers the platform, classifies profile/post/video/reel URLs, selects the scraper, leases the requested worker (or an available worker), and returns next-action curl commands.",
    )
    async def create_job(payload: CreateJobRequest) -> dict:
        try:
            job = worker_orchestrator.create_job(payload)
        except RuntimeError as error:
            raise HTTPException(status_code=409, detail=str(error)) from error
        return _job_response(job)

    @app.get("/v1/jobs", tags=["jobs"])
    async def list_jobs() -> dict:
        worker_orchestrator.reconcile_legacy_partial_jobs()
        worker_orchestrator.reconcile_running_jobs()
        worker_orchestrator.reconcile_watch_jobs()
        worker_orchestrator.reconcile_partial_reasons()
        return {"jobs": [_job_response(job) for job in job_store.list()]}

    @app.get("/v1/jobs/{job_id}", tags=["jobs"])
    async def get_job(job_id: str) -> dict:
        worker_orchestrator.reconcile_legacy_partial_jobs()
        worker_orchestrator.reconcile_running_jobs()
        worker_orchestrator.reconcile_watch_jobs()
        worker_orchestrator.reconcile_partial_reasons()
        job = job_store.get(job_id)
        if job is None:
            raise HTTPException(status_code=404, detail="job not found")
        return _job_response(job)

    @app.post("/v1/jobs/{job_id}/authentication/start", tags=["sessions"])
    async def start_authentication(job_id: str) -> dict:
        try:
            job = await worker_orchestrator.start_authentication(job_id)
        except KeyError as error:
            raise HTTPException(status_code=404, detail="job not found") from error
        except RuntimeError as error:
            raise HTTPException(status_code=409, detail=str(error)) from error
        body = _job_response(job)
        body["authentication"] = {
            "status": "authentication_started" if not worker_orchestrator.is_authenticated(job.worker, job.platform)[0] else "authenticated",
            "login_url": job.login_url,
        }
        return body

    @app.get("/v1/jobs/{job_id}/authentication", tags=["sessions"])
    async def authentication_status(job_id: str) -> dict:
        try:
            body = worker_orchestrator.authentication_status(job_id)
        except KeyError as error:
            raise HTTPException(status_code=404, detail="job not found") from error
        body["next_action"] = (
            f"curl -sS -X POST {_api_base()}/v1/jobs/{job_id}/authentication-complete | jq"
            if body["authenticated"]
            else f"curl -sS {_api_base()}/v1/jobs/{job_id}/authentication | jq"
        )
        return body

    @app.get("/v1/jobs/{job_id}/result", tags=["jobs"])
    async def get_job_result(job_id: str) -> dict:
        if job_store.get(job_id) is None:
            raise HTTPException(status_code=404, detail="job not found")
        result = job_store.load_result(job_id)
        if result is None:
            raise HTTPException(status_code=409, detail="job result is not ready")
        return result

    @app.get("/v1/jobs/{job_id}/result/download", tags=["jobs"])
    async def download_job_result(job_id: str) -> FileResponse:
        job = job_store.get(job_id)
        if job is None:
            raise HTTPException(status_code=404, detail="job not found")
        path = job_store.result_file(job_id)
        if not path.exists():
            raise HTTPException(status_code=409, detail="job result is not ready")
        return FileResponse(
            path,
            media_type="application/json",
            filename=f"{job_id}-result.json",
        )

    @app.get("/v1/jobs/{job_id}/result/summary", tags=["jobs"])
    async def summarize_job_result(job_id: str) -> dict:
        job = job_store.get(job_id)
        if job is None:
            raise HTTPException(status_code=404, detail="job not found")
        result = job_store.load_result(job_id)
        if result is None:
            raise HTTPException(status_code=409, detail="job result is not ready")
        items = result.get("results") or []
        item = items[0] if items else {}
        post = item.get("post") or {}
        reactions = post.get("reactions") or []
        reaction_types: dict[str, int] = {}
        for reaction in reactions:
            label = reaction.get("reaction", "Unknown")
            reaction_types[label] = reaction_types.get(label, 0) + 1
        return {
            "job_id": job_id,
            "status": job.status,
            "result_path": job.result_path,
            "download_url": f"{_api_base()}/v1/jobs/{job_id}/result/download",
            "suggested_output_file": f"{job_id}-result.json",
            "summary": result.get("summary"),
            "completeness": item.get("completeness"),
            "post_url": post.get("url"),
            "comments": len(item.get("comments") or []),
            "reaction_total": (post.get("reactionSummary") or {}).get("total", 0),
            "reactor_records": len(reactions),
            "reaction_count_matches": len(reactions) <= (post.get("reactionSummary") or {}).get("total", 0),
            "reaction_count_note": (
                None
                if len(reactions) <= (post.get("reactionSummary") or {}).get("total", 0)
                else "Extracted reactor identities exceed Facebook's displayed aggregate. The job succeeded, but Facebook totals or identity URLs are inconsistent."
            ),
            "reaction_types": reaction_types,
            "artifacts": result.get("artifacts"),
        }

    @app.post("/v1/jobs/{job_id}/authentication-complete", status_code=202, tags=["sessions"])
    async def authentication_complete(job_id: str) -> dict:
        try:
            job = await worker_orchestrator.authentication_complete(job_id)
        except KeyError as error:
            raise HTTPException(status_code=404, detail="job not found") from error
        except RuntimeError as error:
            raise HTTPException(status_code=409, detail=str(error)) from error
        return _job_response(job)

    @app.delete("/v1/jobs/{job_id}/watch", tags=["jobs"])
    async def stop_watch(job_id: str) -> dict:
        try:
            job = await worker_orchestrator.stop_watch(job_id)
        except KeyError as error:
            raise HTTPException(status_code=404, detail="job not found") from error
        except RuntimeError as error:
            raise HTTPException(status_code=409, detail=str(error)) from error
        return _job_response(job)

    @app.post("/v1/jobs/{job_id}/watch/restart", status_code=202, tags=["jobs"])
    async def restart_watch(job_id: str) -> dict:
        try:
            job = await worker_orchestrator.restart_watch(job_id)
        except KeyError as error:
            raise HTTPException(status_code=404, detail="job not found") from error
        except RuntimeError as error:
            raise HTTPException(status_code=409, detail=str(error)) from error
        return _job_response(job)

    @app.post("/v1/jobs/{job_id}/restart", status_code=202, tags=["jobs"], summary="Resume a failed or cancelled job")
    async def restart_job(job_id: str) -> dict:
        try:
            job = await worker_orchestrator.restart_job(job_id)
        except KeyError as error:
            raise HTTPException(status_code=404, detail="job not found") from error
        except RuntimeError as error:
            raise HTTPException(status_code=409, detail=str(error)) from error
        return _job_response(job)

    @app.post("/v1/jobs/{job_id}/cancel", tags=["jobs"])
    async def cancel_job(job_id: str) -> dict:
        try:
            job = await worker_orchestrator.cancel_job(job_id)
        except KeyError as error:
            raise HTTPException(status_code=404, detail="job not found") from error
        except RuntimeError as error:
            raise HTTPException(status_code=409, detail=str(error)) from error
        return _job_response(job)

    @app.get("/v1/jobs/{job_id}/events", tags=["jobs"])
    async def watch_events(job_id: str) -> dict:
        try:
            events = worker_orchestrator.watch_events(job_id)
        except KeyError as error:
            raise HTTPException(status_code=404, detail="job not found") from error
        return {"events": events}

    @app.get("/v1/jobs/{job_id}/logs", tags=["jobs"])
    async def job_logs(job_id: str, tail: int = Query(default=200, ge=1, le=2000)) -> dict:
        try:
            return worker_orchestrator.job_logs(job_id, tail)
        except KeyError as error:
            raise HTTPException(status_code=404, detail="job not found") from error

    @app.get("/", tags=["meta"])
    async def root() -> dict:
        # the architecture: the gateway and the services it routes to
        return {
            "service": "API Gateway",
            "version": VERSION,
            "job_api": "/v1/jobs",
            "sessions_api": "/v1/sessions",
            "routes": [
                {
                    "path": s.route,
                    "service": s.name,
                    "docker_container": s.container,
                    "forwards_to": f"{s.url}{SCRAPER_ENDPOINT}",
                }
                for s in SERVICES
            ],
            # the one sub-API the scraper services depend on (not a gateway route)
            "session_sub_api": {
                "service": SESSION_SUB_API.name,
                "docker_container": SESSION_SUB_API.container,
                "url": SESSION_SUB_API.url,
                "purpose": SESSION_SUB_API.purpose,
                "used_by": "scraper services (to lease a signed-in Chrome session)",
            },
        }

    return app


app = create_app()
