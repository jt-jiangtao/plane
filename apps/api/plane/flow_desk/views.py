# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from __future__ import annotations

import hmac
import os

from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from plane.flow_desk.models import FlowDeskOutbox, FlowDeskOutboxCursor


def _service_token_ok(request) -> bool:
    expected = os.environ.get("FLOW_DESK_SERVICE_TOKEN", "")
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

        # Client sends after=<last processed>; advance cleanup cursor to that watermark.
        cursor, _ = FlowDeskOutboxCursor.objects.get_or_create(id=1)
        if after > cursor.last_pulled_id:
            cursor.last_pulled_id = after
            cursor.save(update_fields=["last_pulled_id"])

        return Response({"events": events})
