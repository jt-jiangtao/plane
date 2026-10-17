# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.db import models
from django.utils import timezone


class FlowDeskOutbox(models.Model):
    """Serial event log for flow-desk module pull (plane-event-outbox)."""

    KIND_STATE = "state"
    KIND_LABELS = "labels"
    KIND_COMMENT = "comment"
    KIND_CHOICES = (
        (KIND_STATE, "state"),
        (KIND_LABELS, "labels"),
        (KIND_COMMENT, "comment"),
    )

    id = models.BigAutoField(primary_key=True)
    kind = models.CharField(max_length=32, choices=KIND_CHOICES)
    issue_id = models.UUIDField(db_index=True)
    project_id = models.UUIDField()
    workspace_id = models.UUIDField()
    actor_id = models.UUIDField(null=True, blank=True)
    payload = models.JSONField(default=dict)
    created_at = models.DateTimeField(default=timezone.now, db_index=True)

    class Meta:
        db_table = "flow_desk_outbox"
        ordering = ("id",)

    def __str__(self) -> str:
        return f"FlowDeskOutbox(id={self.id}, kind={self.kind})"


class FlowDeskOutboxCursor(models.Model):
    """Singleton: highest outbox id the module has pulled past."""

    id = models.PositiveSmallIntegerField(primary_key=True, default=1)
    last_pulled_id = models.BigIntegerField(default=0)

    class Meta:
        db_table = "flow_desk_outbox_cursor"
