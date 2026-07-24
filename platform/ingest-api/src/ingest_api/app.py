"""FastAPI app factory for the Ingest API (#36)."""

from __future__ import annotations

from fastapi import FastAPI

from .routes import register_routes


def create_app() -> FastAPI:
    app = FastAPI(
        title="Evidence Capture — Ingest API",
        version="0.1.0",
        summary="One door in: validate, open a case, return 202 + job_id. Never blocks.",
    )
    register_routes(app)
    return app


app = create_app()
