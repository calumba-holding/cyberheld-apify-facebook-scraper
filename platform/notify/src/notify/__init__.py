"""Notify (#42) — webhook / email / MCP callback on job completion."""

from .channels import Channel, DeliveryError, EmailChannel, McpCallbackChannel, WebhookChannel
from .service import DeliveryResult, NotifyService, build_notification

__all__ = [
    "Channel",
    "DeliveryError",
    "WebhookChannel",
    "McpCallbackChannel",
    "EmailChannel",
    "NotifyService",
    "DeliveryResult",
    "build_notification",
]
