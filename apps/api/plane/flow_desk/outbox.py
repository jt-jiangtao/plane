# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from __future__ import annotations

import logging
import os
import time
from datetime import timedelta
from typing import Any
from uuid import UUID

import requests
from django.db import connection, transaction
from django.utils import timezone

from plane.db.models import Issue
from plane.flow_desk.models import FlowDeskOutbox, FlowDeskOutboxCursor

logger = logging.getLogger("plane.flow_desk.outbox")

OUTBOX_LOCK_KEY = 0xF10D_E5C0


def notify_module() -> None:
    """POST an empty notify to the flow-desk module. Raises on transport errors."""
    base = os.environ.get(
        "FLOW_DESK_N8N_NOTIFY_URL",
        os.environ.get("FLOW_DESK_PLANE_NOTIFY_URL", "http://n8n:5678/rest/flow-desk/plane/notify"),
    )
    token = os.environ.get("FLOW_DESK_SERVICE_TOKEN", "")
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    requests.post(base, headers=headers, json={}, timeout=2)


def write_outbox_event(
    *,
    kind: str,
    issue: Issue,
    actor_id: str | UUID | None,
    payload: dict[str, Any],
    _test_hold_seconds: float = 0.0,
    _test_barrier: Any = None,
) -> FlowDeskOutbox:
    """
    Insert one outbox row under a transaction-scoped advisory lock so commit
    order matches id order (P37). Notify failures never roll back the row (P34).
    """
    actor_uuid = UUID(str(actor_id)) if actor_id else None

    if _test_barrier is not None:
        _test_barrier.wait(timeout=5)

    with transaction.atomic():
        with connection.cursor() as cursor:
            cursor.execute("SELECT pg_advisory_xact_lock(%s)", [OUTBOX_LOCK_KEY])

        row = FlowDeskOutbox.objects.create(
            kind=kind,
            issue_id=issue.id,
            project_id=issue.project_id,
            workspace_id=issue.workspace_id,
            actor_id=actor_uuid,
            payload=payload,
        )

        if _test_hold_seconds:
            time.sleep(_test_hold_seconds)

        row_id = row.id

    def _notify() -> None:
        try:
            notify_module()
        except Exception as exc:  # noqa: BLE001
            logger.warning("flow-desk notify failed: %s", exc)

    transaction.on_commit(_notify)

    return FlowDeskOutbox.objects.get(id=row_id)


def cleanup_outbox(*, retention_days: int = 30) -> int:
    """Delete rows at/under the pull cursor that are older than retention_days (P35)."""
    cursor, _ = FlowDeskOutboxCursor.objects.get_or_create(id=1)
    cutoff = timezone.now() - timedelta(days=retention_days)
    deleted, _ = FlowDeskOutbox.objects.filter(
        id__lte=cursor.last_pulled_id,
        created_at__lt=cutoff,
    ).delete()
    return deleted


def record_from_activities(issue_activities, issue_id, actor_id) -> None:
    """Write outbox rows for state / labels / comment activities."""
    if not issue_activities or not issue_id:
        return
    issue = Issue.objects.filter(pk=issue_id).first()
    if issue is None:
        return

    for activity in issue_activities:
        field = getattr(activity, "field", None)
        if field == "state":
            write_outbox_event(
                kind=FlowDeskOutbox.KIND_STATE,
                issue=issue,
                actor_id=actor_id,
                payload={
                    "old": activity.old_value,
                    "new": activity.new_value,
                    "old_identifier": str(activity.old_identifier)
                    if activity.old_identifier
                    else None,
                    "new_identifier": str(activity.new_identifier)
                    if activity.new_identifier
                    else None,
                },
            )
        elif field == "labels":
            write_outbox_event(
                kind=FlowDeskOutbox.KIND_LABELS,
                issue=issue,
                actor_id=actor_id,
                payload={
                    "old": activity.old_value,
                    "new": activity.new_value,
                    "old_identifier": str(activity.old_identifier)
                    if activity.old_identifier
                    else None,
                    "new_identifier": str(activity.new_identifier)
                    if activity.new_identifier
                    else None,
                },
            )
        elif field == "comment":
            write_outbox_event(
                kind=FlowDeskOutbox.KIND_COMMENT,
                issue=issue,
                actor_id=actor_id,
                payload={
                    "comment_id": str(activity.issue_comment_id)
                    if getattr(activity, "issue_comment_id", None)
                    else (
                        str(activity.new_identifier) if activity.new_identifier else None
                    ),
                    "body": activity.new_value or activity.comment,
                },
            )
