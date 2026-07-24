"""Offline verification of an evidence package zip — needs nothing but the zip."""

from __future__ import annotations

import base64
import hashlib
import io
import json
import zipfile

from sealing import verify_signature


def verify_package_zip(zip_bytes: bytes) -> tuple[bool, list[str]]:
    problems: list[str] = []
    with zipfile.ZipFile(io.BytesIO(zip_bytes)) as z:
        try:
            manifest_bytes = z.read("package_manifest.json")
            signature = z.read("package_manifest.sig")
            public_key = base64.b64decode(z.read("public_key.b64"))
        except KeyError as e:
            return False, [f"missing package member: {e}"]

        if not verify_signature(public_key, manifest_bytes, signature):
            return False, ["package signature invalid"]

        manifest = json.loads(manifest_bytes)
        for art in manifest.get("artifacts", []):
            name = art["name"]
            try:
                data = z.read(f"artifacts/{name}")
            except KeyError:
                problems.append(f"missing artifact: {name}")
                continue
            if hashlib.sha256(data).hexdigest() != art["sha256"]:
                problems.append(f"hash mismatch (tampered): {name}")
    return (len(problems) == 0), problems
