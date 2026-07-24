"""Run a connector and (optionally) seal its result into the evidence record.

Enrichment output is part of the evidence too — so a connector result is wrapped as
a JSON artifact and sealed like any capture (#34), landing in the Metadata DB + WORM.
"""

from __future__ import annotations

import json
import uuid

from .base import Resolver, get
from .resolvers import SocketResolver

# job_type "enrich/<name>" -> connector name
ENRICH_PREFIX = "enrich/"


def connector_for_job_type(job_type: str) -> str:
    return job_type[len(ENRICH_PREFIX):] if job_type.startswith(ENRICH_PREFIX) else job_type


def run_connector(name: str, value: str, resolver: Resolver | None = None) -> dict:
    return get(name).run(value, resolver or SocketResolver())


def seal_connector_result(session, job_id, connector_name: str, result: dict, storage, signer=None, timestamper=None):
    """Wrap a connector result as a sealed JSON artifact for the job."""
    from sealing import (
        ArtifactInput,
        CaptureBundle,
        LocalDevTimestamper,
        ManifestSigner,
        SealingService,
    )

    signer = signer or ManifestSigner.from_env()
    timestamper = timestamper or LocalDevTimestamper(signer)
    payload = json.dumps(result, sort_keys=True).encode()
    bundle = CaptureBundle(
        job_id=uuid.UUID(str(job_id)),
        worker_id=f"connector:{connector_name}",
        artifacts=[
            ArtifactInput(
                kind="other", filename=f"{connector_name}.json",
                data=payload, mime_type="application/json",
            )
        ],
    )
    service = SealingService(storage, timestamper, signer)
    return service.seal(session, bundle)
