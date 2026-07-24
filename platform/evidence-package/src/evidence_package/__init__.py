"""Evidence Package (#40) — self-contained, offline-verifiable zip for a filing."""

from .builder import build_package
from .verify import verify_package_zip

__all__ = ["build_package", "verify_package_zip"]
