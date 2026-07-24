"""Evidence-capture Metadata DB — the queryable index over sealed evidence.

The SQL migrations in ../migrations are the authoritative schema; the ORM models
here mirror them for the Sealing Service (#34) and Ingest API (#36) to import.
"""

from .repository import Repository

__all__ = ["Repository"]
