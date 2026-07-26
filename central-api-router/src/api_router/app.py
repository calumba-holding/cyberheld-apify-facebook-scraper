"""Central API Router — FastAPI app factory.

The single door that fronts the evidence-capture architecture: authenticates,
opens a case, returns 202 + job_id, and routes each request to the right capability.
It runs no scraper and stores no evidence itself — those are downstream capabilities
it routes to (see /v1/capabilities for the full map)."""

from __future__ import annotations

from fastapi import FastAPI

from .routes import build_router

VERSION = "0.1.0"


def create_app() -> FastAPI:
    app = FastAPI(
        title="Evidence Capture — Central API Router",
        version=VERSION,
        summary="One door in. Routes capture/enrich requests to capabilities; never blocks, runs no scraper.",
        description=(
            "Central API gateway/router for the evidence-capture platform. It owns the "
            "map of the whole system (`GET /v1/capabilities`) and routes each request to "
            "the right capability. Backends are interfaces — no scraper is built into the "
            "gateway."
        ),
    )
    app.include_router(build_router())

    @app.get("/health", tags=["meta"])
    async def health() -> dict:
        return {"status": "ok"}

    @app.get("/", tags=["meta"])
    async def root() -> dict:
        return {
            "service": "central-api-router",
            "version": VERSION,
            "docs": "/docs",
            "architecture": "/v1/capabilities",
        }

    return app


app = create_app()
