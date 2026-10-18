# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from __future__ import annotations

import hmac
import json
import os

from django.conf import settings
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from plane.db.models import ProjectMember
from plane.flow_desk.models import FlowDeskOutbox, FlowDeskOutboxCursor
from plane.flow_desk.proxy import forward_to_module


def _service_token_ok(request) -> bool:
    expected = os.environ.get("FLOW_DESK_SERVICE_TOKEN", "") or getattr(
        settings, "FLOW_DESK_SERVICE_TOKEN", ""
    )
    if not expected:
        return False
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        return False
    provided = auth[len("Bearer ") :].strip()
    return hmac.compare_digest(provided, expected)


class FlowDeskInternalEventsEndpoint(APIView):
    authentication_classes = []
    permission_classes = []

    def get(self, request):
        if not _service_token_ok(request):
            return Response({"error": "unauthorized"}, status=status.HTTP_401_UNAUTHORIZED)

        try:
            after = int(request.query_params.get("after", "0"))
        except (TypeError, ValueError):
            after = 0

        rows = FlowDeskOutbox.objects.filter(id__gt=after).order_by("id")[:500]
        events = [
            {
                "id": row.id,
                "kind": row.kind,
                "issueId": str(row.issue_id),
                "projectId": str(row.project_id),
                "workspaceId": str(row.workspace_id),
                "actorId": str(row.actor_id) if row.actor_id else None,
                "payload": row.payload,
                "createdAt": row.created_at.isoformat(),
            }
            for row in rows
        ]

        cursor, _ = FlowDeskOutboxCursor.objects.get_or_create(id=1)
        if after > cursor.last_pulled_id:
            cursor.last_pulled_id = after
            cursor.save(update_fields=["last_pulled_id"])

        return Response({"events": events})


def _actor_from_user(user) -> str:
    return getattr(user, "email", None) or getattr(user, "username", None) or str(user.id)


class FlowDeskProxyEndpoint(APIView):
    """Authenticated project-scoped proxy to the flow-desk n8n module (P1–P5)."""

    # Auth checked in-handler so anonymous callers get 401 (P2), not DRF's default 403.
    permission_classes = []

    module_path = "/flow-desk/decisions"

    def post(self, request, slug, project_id):
        return self._forward(request, slug, project_id, method="POST")

    def get(self, request, slug, project_id):
        return self._forward(request, slug, project_id, method="GET")

    def put(self, request, slug, project_id):
        return self._forward(request, slug, project_id, method="PUT")

    def _forward(self, request, slug, project_id, *, method: str):
        if not request.user or not request.user.is_authenticated:
            return Response({"error": "unauthorized"}, status=status.HTTP_401_UNAUTHORIZED)

        is_member = ProjectMember.objects.filter(
            project_id=project_id,
            member=request.user,
            is_active=True,
        ).exists()
        if not is_member:
            return Response({"error": "forbidden"}, status=status.HTTP_403_FORBIDDEN)

        body = request.data if hasattr(request, "data") else {}
        if isinstance(body, dict):
            payload = dict(body)
        else:
            payload = {}

        # Ensure django settings overrides from pytest are visible to proxy helpers.
        if hasattr(settings, "FLOW_DESK_MODULE_URL"):
            os.environ["FLOW_DESK_MODULE_URL"] = settings.FLOW_DESK_MODULE_URL
        if hasattr(settings, "FLOW_DESK_SERVICE_TOKEN"):
            os.environ["FLOW_DESK_SERVICE_TOKEN"] = settings.FLOW_DESK_SERVICE_TOKEN

        try:
            upstream = forward_to_module(
                self.module_path,
                method=method,
                body=payload,
                actor=_actor_from_user(request.user),
            )
        except ConnectionError:
            return Response(
                {"error": "flow-desk 模块不可用（module unavailable）"},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        try:
            data = json.loads(upstream.content.decode("utf-8") or "{}")
        except json.JSONDecodeError:
            data = {"raw": upstream.content.decode("utf-8", errors="replace")}
        return Response(data, status=upstream.status_code)


class FlowDeskDecisionsProxy(FlowDeskProxyEndpoint):
    module_path = "/flow-desk/decisions"


class FlowDeskSettingsProxy(FlowDeskProxyEndpoint):
    module_path = "/flow-desk/settings"


class FlowDeskStatusProxy(FlowDeskProxyEndpoint):
    module_path = "/flow-desk/status"


class FlowDeskCredentialsProxy(FlowDeskProxyEndpoint):
    module_path = "/flow-desk/credentials/cursor"


class FlowDeskFindingsProxy(FlowDeskProxyEndpoint):
    module_path = "/flow-desk/findings"
