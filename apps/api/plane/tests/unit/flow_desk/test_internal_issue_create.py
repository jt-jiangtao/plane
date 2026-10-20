"""Service-token creation of a Plane work item for a flow run."""

from __future__ import annotations

from unittest.mock import patch

import pytest
from rest_framework import status
from rest_framework.test import APIClient

from plane.db.models import Issue, IssueComment, Project, ProjectMember, State, Workspace


@pytest.fixture
def workspace(db, create_user):
    return Workspace.objects.create(name="Scan WS", slug="scan-ws", owner=create_user)


@pytest.fixture
def project(db, workspace, create_user):
    project = Project.objects.create(
        name="Scan",
        identifier="SCAN",
        workspace=workspace,
        created_by=create_user,
        updated_by=create_user,
    )
    ProjectMember.objects.create(project=project, member=create_user, role=20, is_active=True)
    return project


@pytest.fixture
def state(db, workspace, project):
    return State.objects.create(name="Backlog", project=project, workspace=workspace, group="backlog", default=True)


@pytest.mark.unit
@pytest.mark.django_db
def test_internal_issue_create_requires_token_and_notifies_with_a_comment(project, state, create_user):
    del state, create_user
    client = APIClient()
    denied = client.post("/api/flow-desk/internal/issues/", {"title": "界面扫描", "project": "SCAN"}, format="json")
    assert denied.status_code == status.HTTP_401_UNAUTHORIZED

    with patch.dict("os.environ", {"FLOW_DESK_SERVICE_TOKEN": "svc-secret"}):
        client.credentials(HTTP_AUTHORIZATION="Bearer svc-secret")
        missing = client.post("/api/flow-desk/internal/issues/", {"title": "界面扫描"}, format="json")
        assert missing.status_code == status.HTTP_400_BAD_REQUEST
        created = client.post(
            "/api/flow-desk/internal/issues/",
            {
                "title": "界面扫描",
                "project": "SCAN",
                "labels": ["flow:ui-audit", "area:web"],
            },
            format="json",
        )
        assert created.status_code == status.HTTP_201_CREATED
        issue = Issue.objects.get(pk=created.json()["id"])
        assert issue.name == "界面扫描"
        assert sorted(issue.labels.values_list("name", flat=True)) == ["area:web", "flow:ui-audit"]
        unknown = client.post(
            "/api/flow-desk/internal/issues/",
            {"title": "界面扫描", "project": "MISSING"},
            format="json",
        )
        assert unknown.status_code == status.HTTP_404_NOT_FOUND
        comment = client.post(
            f"/api/flow-desk/internal/issues/{issue.id}/comments/",
            {"comment": "已创建界面扫描"},
            format="json",
        )
        assert comment.status_code == status.HTTP_201_CREATED
        assert IssueComment.objects.filter(issue=issue, comment_stripped="已创建界面扫描").exists()


@pytest.mark.unit
@pytest.mark.django_db
def test_scan_finding_preserves_evidence_and_deduplicates(project, state):
    client = APIClient()
    fields = {
        "title": "Clipped button", "project": "SCAN", "page": "/settings",
        "reproduction": "Open settings at 375px", "suggestion": "Remove clipping",
        "labels": ["scan:layout"], "files": ["settings.tsx"],
        "evidence": [{"kind": "image", "name": "full", "url": "https://example.test/full.png"},
                     {"kind": "image", "name": "crop", "url": "https://example.test/crop.png"}],
    }
    with patch.dict("os.environ", {"FLOW_DESK_SERVICE_TOKEN": "svc-secret"}):
        client.credentials(HTTP_AUTHORIZATION="Bearer svc-secret")
        first = client.post("/api/flow-desk/internal/issues/", fields, format="json")
        assert first.status_code == 201
        issue = Issue.objects.get(pk=first.json()["id"])
        assert issue.description_json["flowDeskScan"]["evidence"] == fields["evidence"]
        assert "Open settings" in issue.description_stripped
        second = client.post("/api/flow-desk/internal/issues/", fields, format="json")
        assert second.json()["id"] == first.json()["id"]
        assert second.json()["created"] is False


@pytest.mark.unit
@pytest.mark.django_db
def test_source_retry_is_idempotent_and_task_listing_is_project_scoped(project, state):
    client = APIClient()
    with patch.dict("os.environ", {"FLOW_DESK_SERVICE_TOKEN": "svc-secret"}):
        client.credentials(HTTP_AUTHORIZATION="Bearer svc-secret")
        fields = {"title": "Scan parent", "project": "SCAN", "sourceKey": "run:parent"}
        first = client.post("/api/flow-desk/internal/issues/", fields, format="json")
        second = client.post("/api/flow-desk/internal/issues/", fields, format="json")
        assert first.status_code == 201
        assert second.json()["id"] == first.json()["id"]
        assert second.json()["created"] is False
        tasks = client.get("/api/flow-desk/internal/issues/?project=SCAN")
        assert tasks.status_code == 200
        assert len(tasks.json()["items"]) == 1
        denied = client.get("/api/flow-desk/internal/issues/?project=MISSING")
        assert denied.status_code == 404

@pytest.mark.unit
@pytest.mark.django_db
def test_internal_project_registration_is_idempotent_and_owned_by_local_human(workspace):
    client = APIClient()
    with patch.dict("os.environ", {"FLOW_DESK_SERVICE_TOKEN": "svc-secret"}):
        client.credentials(HTTP_AUTHORIZATION="Bearer svc-secret")
        first = client.post("/api/flow-desk/internal/projects/", {"projectId": "repo-a", "name": "Repo A"}, format="json")
        assert first.status_code == 201
        second = client.post("/api/flow-desk/internal/projects/", {"projectId": "repo-a", "name": "Repo A"}, format="json")
        assert second.json()["id"] == first.json()["id"]

@pytest.mark.unit
@pytest.mark.django_db
def test_internal_update_preserves_scan_metadata_and_deduplicates(project, state):
    issue = Issue.objects.create(name="Before", project=project, workspace=project.workspace,
                                 state=state, description_json={"flowDeskScan": {"evidence": ["kept"]}})
    completed = State.objects.create(name="Done", group="completed", project=project, workspace=project.workspace)
    client = APIClient()
    with patch.dict("os.environ", {"FLOW_DESK_SERVICE_TOKEN": "svc-secret"}):
        client.credentials(HTTP_AUTHORIZATION="Bearer svc-secret")
        body = {"project": "SCAN", "operation": "update", "title": "After", "stateGroup": "completed", "sourceKey": "update-1"}
        response = client.post(f"/api/flow-desk/internal/issues/{issue.id}/", body, format="json")
        assert response.status_code == 200
        issue.refresh_from_db()
        assert issue.name == "After"
        assert issue.state_id == completed.id
        assert issue.description_json["flowDeskScan"]["evidence"] == ["kept"]
        assert client.post(f"/api/flow-desk/internal/issues/{issue.id}/", body, format="json").json()["replayed"] is True
        assert client.post(f"/api/flow-desk/internal/issues/{issue.id}/", {**body, "title": "Conflicting retry"}, format="json").status_code == 409
        assert client.post(f"/api/flow-desk/internal/issues/{issue.id}/", {**body, "project": "OTHER", "sourceKey": "cross"}, format="json").status_code == 404


@pytest.mark.unit
@pytest.mark.django_db
def test_internal_links_are_project_scoped_idempotent_and_bidirectional(project, state):
    from plane.db.models import IssueRelation
    first = Issue.objects.create(name="First", project=project, workspace=project.workspace, state=state)
    second = Issue.objects.create(name="Second", project=project, workspace=project.workspace, state=state)
    client = APIClient()
    with patch.dict("os.environ", {"FLOW_DESK_SERVICE_TOKEN": "svc-secret"}):
        client.credentials(HTTP_AUTHORIZATION="Bearer svc-secret")
        body = {"project": "SCAN", "operation": "link", "targetId": str(second.id), "relation": "follow_up", "sourceKey": "link-1"}
        assert client.post(f"/api/flow-desk/internal/issues/{first.id}/", body, format="json").status_code == 200
        assert client.post(f"/api/flow-desk/internal/issues/{first.id}/", body, format="json").status_code == 200
        assert IssueRelation.objects.filter(issue=first, related_issue=second, relation_type="follow_up").count() == 1
        assert IssueRelation.objects.filter(issue=second, related_issue=first, relation_type="followed_by").count() == 1
        assert client.post(f"/api/flow-desk/internal/issues/{first.id}/", {**body, "targetId": str(first.id), "sourceKey": "self"}, format="json").status_code == 400
        client.credentials()
        assert client.post(f"/api/flow-desk/internal/issues/{first.id}/", body, format="json").status_code == 401


@pytest.mark.unit
@pytest.mark.django_db
def test_code_finding_keeps_evidence_parent_and_deduplicates(project, state):
    client = APIClient()
    with patch.dict("os.environ", {"FLOW_DESK_SERVICE_TOKEN": "svc-secret"}):
        client.credentials(HTTP_AUTHORIZATION="Bearer svc-secret")
        parent = client.post("/api/flow-desk/internal/issues/", {"title": "Parent", "project": "SCAN"}, format="json").json()["id"]
        fields = {"title": "Code bug", "project": "SCAN", "parentId": parent, "kind": "code",
                  "reproduction": "Read src/a.ts", "suggestion": "Fix condition", "files": ["src/a.ts"],
                  "evidence": [{"kind": "code", "name": "source", "url": "/artifact/source.json"}]}
        created = client.post("/api/flow-desk/internal/issues/", fields, format="json")
        assert created.status_code == 201
        issue = Issue.objects.get(pk=created.json()["id"])
        assert str(issue.parent_id) == parent
        assert issue.description_json["flowDeskScan"]["evidence"] == fields["evidence"]
        duplicate = client.post("/api/flow-desk/internal/issues/", fields, format="json")
        assert duplicate.json()["id"] == str(issue.id)
        assert duplicate.json()["created"] is False
        invalid = client.post("/api/flow-desk/internal/issues/", {**fields,"title":"No source","files":[]}, format="json")
        assert invalid.status_code == 400
