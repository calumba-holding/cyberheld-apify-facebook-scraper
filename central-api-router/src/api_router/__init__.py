"""Central API Router — the one door / gateway for the evidence-capture architecture."""

from .app import create_app

__all__ = ["create_app"]
