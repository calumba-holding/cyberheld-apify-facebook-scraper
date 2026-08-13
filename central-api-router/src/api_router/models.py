from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field, HttpUrl, field_validator, model_validator


Platform = Literal["facebook", "instagram"]


class CreateJobRequest(BaseModel):
    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "platform": "instagram",
                    "action": "scrape",
                    "target_url": "https://www.instagram.com/reel/SHORTCODE/",
                    "worker": 1,
                },
                {
                    "platform": "instagram",
                    "action": "profile",
                    "target_url": "https://www.instagram.com/USERNAME/",
                    "worker": 1,
                    "max_posts": 20,
                },
                {
                    "platform": "facebook",
                    "action": "watch",
                    "target_url": "https://www.facebook.com/PROFILE/posts/POST_ID",
                    "worker": 1,
                    "poll_interval_seconds": 90,
                },
            ],
        },
    }

    target_url: HttpUrl
    platform: Optional[Platform] = Field(default=None, description="Inferred from target_url when omitted.")
    action: Optional[Literal["scrape", "watch", "profile"]] = None
    scraper: Literal["post-engagement", "reel-engagement", "profile-scraper"] = "post-engagement"
    continue_watching: bool = False
    worker: Optional[int] = Field(default=None, ge=1, le=100, description="Registered persistent worker slot. Omit for automatic selection.")
    max_posts: int = Field(default=20, ge=1, le=100)
    poll_interval_seconds: int = Field(default=90, ge=30, le=3600)

    def detected_platform(self) -> Platform:
        host = (self.target_url.host or "").lower()
        if host == "instagram.com" or host.endswith(".instagram.com"):
            return "instagram"
        return "facebook"

    def detected_content_type(self) -> Literal["reel", "video", "post", "profile"]:
        path = self.target_url.path.lower().rstrip("/")
        query = self.target_url.query or ""
        platform = self.platform or self.detected_platform()
        if platform == "instagram":
            if any(path.startswith(prefix) for prefix in ("/reel/", "/reels/", "/tv/")):
                return "reel"
            if path.startswith("/p/"):
                return "post"
            return "profile"
        if path.startswith("/reel/"):
            return "reel"
        if path.startswith("/watch") and "v=" in query:
            return "video"
        if "/videos/" in path:
            return "video"
        if any(token in path for token in ("/posts/", "/permalink/", "/share/p/", "/share/v/")):
            return "post"
        if path.endswith("/story.php") or path.endswith("/photo.php"):
            return "post"
        return "profile"

    @model_validator(mode="after")
    def apply_action(self) -> "CreateJobRequest":
        self.platform = self.platform or self.detected_platform()
        detected = self.detected_content_type()
        if self.platform == "instagram" and self.action == "watch":
            raise ValueError("watch action is currently supported only for Facebook")
        if self.action is None:
            self.scraper = (
                "profile-scraper" if detected == "profile"
                else "reel-engagement" if detected == "reel" and self.platform == "facebook"
                else "post-engagement"
            )
            self.continue_watching = False
        if self.action == "scrape":
            self.scraper = "reel-engagement" if detected == "reel" and self.platform == "facebook" else "post-engagement"
            self.continue_watching = False
        elif self.action == "watch":
            self.scraper = "reel-engagement" if detected == "reel" else "post-engagement"
            self.continue_watching = True
        elif self.action == "profile":
            if detected != "profile":
                raise ValueError("profile action requires a Facebook profile URL")
            self.scraper = "profile-scraper"
            self.continue_watching = False
        return self

    @field_validator("target_url")
    @classmethod
    def require_supported_platform(cls, value: HttpUrl) -> HttpUrl:
        host = (value.host or "").lower()
        supported = any(host == domain or host.endswith(f".{domain}") for domain in ("facebook.com", "instagram.com"))
        if not supported:
            raise ValueError("target_url must be a facebook.com or instagram.com URL")
        return value

    @model_validator(mode="after")
    def require_matching_platform(self) -> "CreateJobRequest":
        inferred = self.detected_platform()
        if self.platform and self.platform != inferred:
            raise ValueError(f"platform {self.platform} does not match the target_url host")
        return self


JobStatus = Literal[
    "queued",
    "needs_authentication",
    "running",
    "watching",
    "succeeded",
    "partial",
    "failed",
    "cancelled",
]


class JobRecord(BaseModel):
    job_id: str
    status: JobStatus
    platform: Platform = "facebook"
    target_url: str
    scraper: str
    continue_watching: bool
    worker: int
    max_posts: int
    poll_interval_seconds: int
    created_at: str
    updated_at: str
    login_url: Optional[str] = None
    result_path: Optional[str] = None
    watch_id: Optional[str] = None
    error: Optional[str] = None
    partial_reason: Optional[str] = None
    partial_accepted: bool = False
    partial_accepted_at: Optional[str] = None


class SessionRecord(BaseModel):
    worker: int
    platform: Platform = "facebook"
    authenticated: bool
    state: Literal["available", "leased", "login_required"]
    login_url: str
    leased_by: Optional[str] = None
    reason: Optional[str] = None


class CreateWorkerRequest(BaseModel):
    """Create the next persistent local Chrome identity slot."""

    label: Optional[str] = Field(default=None, max_length=80, examples=["Investigation account 6"])


class WorkerRecord(BaseModel):
    worker: int
    label: str
    novnc_port: int
    created_at: str
    enabled: bool = True