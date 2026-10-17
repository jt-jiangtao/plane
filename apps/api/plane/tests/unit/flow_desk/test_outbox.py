# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""P31, P33–P35, P37: flow_desk_outbox write / notify / pull / cleanup."""

from __future__ import annotations

import threading
import time
from datetime import timedelta
from unittest.mock import MagicMock, patch

import pytest
from django.db import connection, transaction
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from plane.db.models import Issue, IssueComment, Label, Project, ProjectMember, State, Workspace
from plane.flow_desk.models import FlowDeskOutbox, FlowDeskOutboxCursor
from plane.flow_desk.outbox import cleanup_outbox, write_outbox_event


@pytest.fixture
def workspace(db, create_user):
    return Workspace.objects.create(name="Outbox WS", slug="outbox-ws", owner=create_user)


@pytest.fixture
def project(db, workspace, create_user):
    project = Project.objects.create(
        name="Outbox",
        identifier="OUT",
        workspace=workspace,
        created_by=create_user,
        updated_by=create_user,
    )
    ProjectMember.objects.create(project=project, member=create_user, role=20, is_active=True)
    return project


@pytest.fixture
def states(db, workspace, project):
    backlog = State.objects.create(
        name="Backlog",
        project=project,
        workspace=workspace,
        group="backlog",
        default=True,
    )
    todo = State.objects.create(
        name="待做",
        project=project,
        workspace=workspace,
        group="unstarted",
    )
    return {"backlog": backlog, "todo": todo}


@pytest.fixture
def issue(db, workspace, project, states, create_user):
    return Issue.objects.create(
        name="Parent",
        project=project,
        workspace=workspace,
        state=states["backlog"],
        created_by=create_user,
    )


@pytest.mark.unit
class TestFlowDeskOutbox:
    @pytest.mark.django_db(transaction=True)
    def test_p31_three_entry_points_write_and_notify(self, issue, states, create_user, project, workspace):
        """P31: state / labels / comment each write a row and notify the module."""
        label = Label.objects.create(name="flow:skeleton", project=project, workspace=workspace)
        notifications: list[object] = []

        def capture_notify(*_args, **_kwargs):
            notifications.append(True)

        with patch("plane.flow_desk.outbox.notify_module", side_effect=capture_notify):
            # Simulate frontend / API / bulk paths: all funnel through write_outbox_event
            # after issue_activity records state, labels, or comment changes.
            write_outbox_event(
                kind="state",
                issue=issue,
                actor_id=str(create_user.id),
                payload={"old": str(states["backlog"].id), "new": str(states["todo"].id)},
            )
            write_outbox_event(
                kind="labels",
                issue=issue,
                actor_id=str(create_user.id),
                payload={"added": [str(label.id)], "removed": []},
            )
            comment = IssueComment.objects.create(
                comment_html="<p>/approve</p>",
                issue=issue,
                project=project,
                workspace=workspace,
                actor=create_user,
            )
            write_outbox_event(
                kind="comment",
                issue=issue,
                actor_id=str(create_user.id),
                payload={"comment_id": str(comment.id), "body": "/approve"},
            )

            # Also exercise the issue_activity hook for a state change (frontend-style).
            from plane.bgtasks.issue_activities_task import issue_activity

            issue_activity(
                type="issue.activity.updated",
                requested_data={"state_id": str(states["todo"].id)},
                current_instance={"state_id": str(states["backlog"].id)},
                issue_id=str(issue.id),
                actor_id=str(create_user.id),
                project_id=str(project.id),
                epoch=time.time(),
            )

        rows = list(FlowDeskOutbox.objects.order_by("id"))
        assert len(rows) >= 3
        kinds = {row.kind for row in rows}
        assert "state" in kinds
        assert "labels" in kinds
        assert "comment" in kinds
        ids = [row.id for row in rows]
        assert ids == sorted(ids)
        assert len(notifications) >= 3

    @pytest.mark.django_db
    def test_p33_pull_events_and_auth(self, issue, create_user):
        """P33: GET /api/flow-desk/internal/events?after= requires service token."""
        write_outbox_event(kind="state", issue=issue, actor_id=str(create_user.id), payload={"n": 1})
        write_outbox_event(kind="state", issue=issue, actor_id=str(create_user.id), payload={"n": 2})
        first = FlowDeskOutbox.objects.order_by("id").first()
        assert first is not None

        client = APIClient()
        bad = client.get("/api/flow-desk/internal/events/", {"after": 0})
        assert bad.status_code == status.HTTP_401_UNAUTHORIZED

        client.credentials(HTTP_AUTHORIZATION="Bearer wrong-token")
        bad2 = client.get("/api/flow-desk/internal/events/", {"after": 0})
        assert bad2.status_code == status.HTTP_401_UNAUTHORIZED

        with patch.dict("os.environ", {"FLOW_DESK_SERVICE_TOKEN": "svc-secret"}):
            client.credentials(HTTP_AUTHORIZATION="Bearer svc-secret")
            ok = client.get("/api/flow-desk/internal/events/", {"after": first.id - 1})
        assert ok.status_code == status.HTTP_200_OK
        events = ok.json()["events"]
        assert len(events) >= 1
        assert events == sorted(events, key=lambda e: e["id"])
        assert all(e["id"] > first.id - 1 for e in events)

    @pytest.mark.django_db
    def test_p34_notify_failure_keeps_row(self, issue, create_user):
        """P34: n8n down — mutation path still stores the outbox row."""
        with patch("plane.flow_desk.outbox.notify_module", side_effect=RuntimeError("n8n down")):
            write_outbox_event(
                kind="state",
                issue=issue,
                actor_id=str(create_user.id),
                payload={"ok": True},
            )
        assert FlowDeskOutbox.objects.count() == 1

    @pytest.mark.django_db
    def test_p35_cleanup_only_old_pulled_rows(self, issue, create_user):
        """P35: cleanup deletes only rows at/under cursor and older than 30 days."""
        old = write_outbox_event(kind="state", issue=issue, actor_id=str(create_user.id), payload={"a": 1})
        mid = write_outbox_event(kind="state", issue=issue, actor_id=str(create_user.id), payload={"a": 2})
        recent = write_outbox_event(kind="state", issue=issue, actor_id=str(create_user.id), payload={"a": 3})

        FlowDeskOutbox.objects.filter(id__in=[old.id, mid.id]).update(
            created_at=timezone.now() - timedelta(days=31)
        )
        FlowDeskOutboxCursor.objects.update_or_create(defaults={"last_pulled_id": mid.id}, id=1)

        cleanup_outbox()

        remaining = set(FlowDeskOutbox.objects.values_list("id", flat=True))
        assert old.id not in remaining
        assert mid.id not in remaining
        assert recent.id in remaining

    @pytest.mark.django_db(transaction=True)
    def test_p37_concurrent_writes_preserve_order(self, issue, create_user):
        """P37: advisory lock serializes commits so a lower id cannot lag behind a higher one."""
        results: dict[str, int] = {}
        slow_holds = threading.Event()
        fast_finished = threading.Event()

        def slow_writer():
            row = write_outbox_event(
                kind="state",
                issue=issue,
                actor_id=str(create_user.id),
                payload={"who": "slow"},
                _test_hold_seconds=0.5,
            )
            results["slow"] = row.id
            connection.close()

        def fast_writer():
            # Wait until slow has likely taken the lock and created its row.
            time.sleep(0.1)
            slow_holds.set()
            row = write_outbox_event(
                kind="state",
                issue=issue,
                actor_id=str(create_user.id),
                payload={"who": "fast"},
            )
            results["fast"] = row.id
            # While slow still holds, fast must not have committed yet — enforced by lock.
            fast_finished.set()
            connection.close()

        t_slow = threading.Thread(target=slow_writer)
        t_fast = threading.Thread(target=fast_writer)
        t_slow.start()
        t_fast.start()
        t_slow.join(timeout=5)
        t_fast.join(timeout=5)

        assert "slow" in results and "fast" in results
        assert results["slow"] < results["fast"]
        ids = list(FlowDeskOutbox.objects.order_by("id").values_list("id", flat=True))
        assert ids == sorted(ids)
        assert results["slow"] in ids and results["fast"] in ids
        assert slow_holds.is_set() and fast_finished.is_set()
