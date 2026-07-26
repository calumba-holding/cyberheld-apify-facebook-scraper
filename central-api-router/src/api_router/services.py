"""The architecture: the API Gateway and the separate scraper services it routes to.

Each scraper is its own service (its own docker container) exposing ONE API. The
gateway does not scrape — it forwards the request to the scraper's API. This is the
whole diagram, as data.
"""

from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class ScraperService:
    route: str          # gateway path, e.g. "/facebook/screenshot"
    name: str           # e.g. "API Facebook Screenshot"
    container: str      # the docker container that runs the scraper
    url_env: str        # env var overriding the service base URL
    default_url: str    # default base URL (docker-compose service name)

    @property
    def url(self) -> str:
        return os.environ.get(self.url_env, self.default_url)


# Exactly the four boxes in the diagram.
SERVICES: list[ScraperService] = [
    ScraperService(
        "/facebook/watch", "API Facebook Watch", "watch-posting",
        "SCRAPER_FACEBOOK_WATCH_URL", "http://facebook-watch:8000",
    ),
    ScraperService(
        "/facebook/screenshot", "API Facebook Screenshot", "screenshot",
        "SCRAPER_FACEBOOK_SCREENSHOT_URL", "http://facebook-screenshot:8000",
    ),
    ScraperService(
        "/instagram/screenshot", "API Instagram Screenshot", "screenshot",
        "SCRAPER_INSTAGRAM_SCREENSHOT_URL", "http://instagram-screenshot:8000",
    ),
    ScraperService(
        "/facebook/comments", "API Facebook Comments", "comments-scraper",
        "SCRAPER_FACEBOOK_COMMENTS_URL", "http://facebook-comments:8000",
    ),
]

# The single endpoint each scraper service exposes (the "1 API" the gateway calls).
SCRAPER_ENDPOINT = "/run"
