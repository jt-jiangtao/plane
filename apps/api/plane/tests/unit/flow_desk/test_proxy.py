"""P1–P5: Plane backend flow-desk proxy (login, membership, forward, errors)."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest
from rest_framework import status
from rest_framework.test import APIClient

from plane.db.models import Project, ProjectMember, User, Workspace


@pytest.fixture
def workspace(db, create_user):
    return Workspace.objects.create(name="Proxy WS", slug="proxy-ws", owner=create_user)


@pytest.fixture
def project(db, workspace, create_user):
    project = Project.objects.create(
        name="Proxy",
        identifier="PRX",
        workspace=workspace,
        created_by=create_user,
        updated_by=create_user,
    )
    ProjectMember.objects.create(project=project, member=create_user, role=20, is_active=True)
    return project


@pytest.fixture
def client():
    return APIClient()


@pytest.mark.unit
class TestFlowDeskProxy:
    @pytest.mark.django_db
    def test_p1_logged_in_member_forwards_with_session_actor(
        self, client, create_user, project, workspace, settings
    ):
        settings.FLOW_DESK_MODULE_URL = "http://n8n.test"
        settings.FLOW_DESK_SERVICE_TOKEN = "svc-secret"
        client.force_authenticate(user=create_user)

        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.content = b'{"ok":true}'
        mock_resp.headers = {"content-type": "application/json"}

        with patch("plane.flow_desk.proxy.http_request", return_value=mock_resp) as http:
            res = client.post(
                f"/api/workspaces/{workspace.slug}/projects/{project.id}/flow-desk/decisions/",
                {"decision": "approve", "actor": "forged-actor", "executionId": "e1", "nodeId": "n1"},
                format="json",
            )

        assert res.status_code == 200
        assert http.called
        _args, kwargs = http.call_args
        assert kwargs["headers"]["Authorization"] == "Bearer svc-secret"
        body = kwargs["json_body"]
        assert body["actor"] != "forged-actor"
        assert body["actor"] in {create_user.email, str(create_user.id), create_user.username}

    @pytest.mark.django_db
    def test_p2_anonymous_401_no_forward(self, client, project, workspace):
        with patch("plane.flow_desk.proxy.http_request") as http:
            res = client.post(
                f"/api/workspaces/{workspace.slug}/projects/{project.id}/flow-desk/decisions/",
                {"decision": "approve"},
                format="json",
            )
        assert res.status_code == status.HTTP_401_UNAUTHORIZED
        assert not http.called

    @pytest.mark.django_db
    def test_p3_non_member_403_no_forward(self, client, project, workspace):
        from uuid import uuid4

        outsider = User.objects.create(
            email=f"outsider-{uuid4().hex[:8]}@plane.so",
            username=f"outsider-{uuid4().hex[:8]}",
            first_name="Out",
            last_name="Sider",
        )
        client.force_authenticate(user=outsider)
        with patch("plane.flow_desk.proxy.http_request") as http:
            res = client.post(
                f"/api/workspaces/{workspace.slug}/projects/{project.id}/flow-desk/decisions/",
                {"decision": "approve"},
                format="json",
            )
        assert res.status_code == status.HTTP_403_FORBIDDEN
        assert not http.called

    @pytest.mark.django_db
    def test_p4_module_error_passthrough(self, client, create_user, project, workspace, settings):
        settings.FLOW_DESK_MODULE_URL = "http://n8n.test"
        settings.FLOW_DESK_SERVICE_TOKEN = "svc-secret"
        client.force_authenticate(user=create_user)
        mock_resp = MagicMock()
        mock_resp.status_code = 409
        mock_resp.content = b'{"error":"node not waiting"}'
        mock_resp.headers = {"content-type": "application/json"}
        with patch("plane.flow_desk.proxy.http_request", return_value=mock_resp):
            res = client.post(
                f"/api/workspaces/{workspace.slug}/projects/{project.id}/flow-desk/decisions/",
                {"decision": "approve"},
                format="json",
            )
        assert res.status_code == 409
        assert res.json()["error"] == "node not waiting"

    @pytest.mark.django_db
    def test_p5_module_unavailable_503(self, client, create_user, project, workspace, settings):
        settings.FLOW_DESK_MODULE_URL = "http://n8n.test"
        settings.FLOW_DESK_SERVICE_TOKEN = "svc-secret"
        client.force_authenticate(user=create_user)
        with patch("plane.flow_desk.proxy.http_request", side_effect=ConnectionError("down")):
            res = client.post(
                f"/api/workspaces/{workspace.slug}/projects/{project.id}/flow-desk/decisions/",
                {"decision": "approve"},
                format="json",
            )
        assert res.status_code == status.HTTP_503_SERVICE_UNAVAILABLE
        err = res.json()["error"]
        assert "不可用" in err or "unavailable" in err.lower()
