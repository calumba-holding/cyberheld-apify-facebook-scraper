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

import httpx
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from .services import SCRAPER_ENDPOINT, SERVICES, ScraperService

VERSION = "0.2.0"


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


def create_app() -> FastAPI:
    app = FastAPI(
        title="API Gateway",
        version=VERSION,
        summary="Routes each path to its own scraper service. No scraping, no jobs, in the gateway.",
    )

    # the four routes -> four scraper services
    for svc in SERVICES:
        app.add_api_route(
            svc.route, _make_handler(svc), methods=["POST"],
            name=svc.name, tags=["gateway"],
        )

    @app.get("/health", tags=["meta"])
    async def health() -> dict:
        return {"status": "ok"}

    @app.get("/", tags=["meta"])
    async def root() -> dict:
        # the architecture: the gateway and the services it routes to
        return {
            "service": "API Gateway",
            "version": VERSION,
            "routes": [
                {
                    "path": s.route,
                    "service": s.name,
                    "docker_container": s.container,
                    "forwards_to": f"{s.url}{SCRAPER_ENDPOINT}",
                }
                for s in SERVICES
            ],
        }

    return app


app = create_app()
