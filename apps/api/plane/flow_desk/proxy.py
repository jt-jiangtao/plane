# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from __future__ import annotations

import json
import os
from typing import Any
from urllib import error, request


def http_request(
    method: str,
    url: str,
    *,
    headers: dict[str, str] | None = None,
    json_body: dict[str, Any] | None = None,
    timeout: float = 15.0,
):
    """Thin wrapper so unit tests can patch `plane.flow_desk.proxy.http_request`."""
    data = None
    hdrs = dict(headers or {})
    if json_body is not None:
        data = json.dumps(json_body).encode("utf-8")
        hdrs.setdefault("Content-Type", "application/json")
    req = request.Request(url, data=data, headers=hdrs, method=method.upper())
    try:
        with request.urlopen(req, timeout=timeout) as resp:
            body = resp.read()
            return _Response(resp.status, body, dict(resp.headers))
    except error.HTTPError as exc:
        body = exc.read() if hasattr(exc, "read") else b""
        return _Response(exc.code, body, dict(exc.headers or {}))


class _Response:
    def __init__(self, status_code: int, content: bytes, headers: dict):
        self.status_code = status_code
        self.content = content
        self.headers = headers

    def json(self):
        return json.loads(self.content.decode("utf-8") or "{}")


def module_base_url() -> str:
    return os.environ.get("FLOW_DESK_MODULE_URL") or getattr(
        __import__("django.conf", fromlist=["settings"]).settings,
        "FLOW_DESK_MODULE_URL",
        "http://n8n:5678",
    )


def service_token() -> str:
    if os.environ.get("FLOW_DESK_DESKTOP_MODE") == "true":
        from pathlib import Path
        try:
            location = os.environ.get("FLOW_DESK_DESKTOP_SECRET_FILE", "/tmp/flow-desk-desktop-token")
            return Path(location).read_text().strip()
        except OSError:
            return ""
    return os.environ.get("FLOW_DESK_SERVICE_TOKEN") or getattr(
        __import__("django.conf", fromlist=["settings"]).settings,
        "FLOW_DESK_SERVICE_TOKEN",
        "",
    )


def forward_to_module(
    path: str,
    *,
    method: str = "POST",
    body: dict[str, Any] | None = None,
    actor: str,
):
    payload = dict(body or {})
    payload.pop("actor", None)
    payload["actor"] = actor
    url = module_base_url().rstrip("/") + path
    headers = {
        "Authorization": f"Bearer {service_token()}",
        "Content-Type": "application/json",
    }
    try:
        return http_request(method, url, headers=headers, json_body=payload)
    except Exception as exc:  # noqa: BLE001 — surface as 503 upstream
        raise ConnectionError(str(exc)) from exc
