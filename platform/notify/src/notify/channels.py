"""Delivery channels. Each takes an injectable transport, so delivery is testable
offline; defaults do real IO (HTTP / SMTP)."""

from __future__ import annotations

from typing import Callable, Protocol


class DeliveryError(RuntimeError):
    pass


class Channel(Protocol):
    name: str
    target: str

    def send(self, payload: dict) -> None: ...


def _http_post(url: str, payload: dict) -> None:
    import httpx

    try:
        resp = httpx.post(url, json=payload, timeout=10)
        resp.raise_for_status()
    except Exception as e:  # network / non-2xx
        raise DeliveryError(f"POST {url} failed: {e}") from e


class WebhookChannel:
    name = "webhook"

    def __init__(self, url: str, transport: Callable[[str, dict], None] | None = None) -> None:
        self.target = url
        self._post = transport or _http_post

    def send(self, payload: dict) -> None:
        self._post(self.target, payload)


class McpCallbackChannel:
    """MCP callback — same transport as a webhook, MCP-shaped envelope."""

    name = "mcp"

    def __init__(self, url: str, transport: Callable[[str, dict], None] | None = None) -> None:
        self.target = url
        self._post = transport or _http_post

    def send(self, payload: dict) -> None:
        self._post(self.target, {"type": "mcp_callback", "data": payload})


def _smtp_send(to: str, subject: str, body: str) -> None:  # pragma: no cover (needs SMTP)
    import os
    import smtplib
    from email.message import EmailMessage

    msg = EmailMessage()
    msg["From"] = os.environ.get("NOTIFY_FROM", "evidence@localhost")
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(body)
    host = os.environ.get("SMTP_HOST", "localhost")
    port = int(os.environ.get("SMTP_PORT", "25"))
    try:
        with smtplib.SMTP(host, port, timeout=10) as s:
            s.send_message(msg)
    except Exception as e:
        raise DeliveryError(f"email to {to} failed: {e}") from e


class EmailChannel:
    name = "email"

    def __init__(
        self, to: str, transport: Callable[[str, str, str], None] | None = None
    ) -> None:
        self.target = to
        self._send = transport or _smtp_send

    def send(self, payload: dict) -> None:
        subject = payload.get("message", "evidence capture: job done")
        body = "\n".join(f"{k}: {v}" for k, v in payload.items())
        self._send(self.target, subject, body)
