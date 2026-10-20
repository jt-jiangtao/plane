import pytest
from rest_framework.test import APIClient

@pytest.mark.unit
@pytest.mark.django_db
def test_migration_actions_keep_human_identity_and_failed_upstream_status(create_user, monkeypatch):
    from unittest.mock import patch
    from plane.db.models import Workspace
    monkeypatch.setenv("FLOW_DESK_DESKTOP_MODE", "true")
    Workspace.objects.create(name="Local", slug="flow-desk", owner=create_user)
    client = APIClient()
    client.force_authenticate(user=create_user)
    with patch("plane.flow_desk.desktop.forward_project_request", return_value=({"error": "trial failed"}, 409)) as forward:
        response = client.post("/api/flow-desk/desktop/project-workflows/", {"operation": "migration-activate", "actor": "forged", "input": {"projectId": "p", "contentHash": "reviewed"}}, format="json")
        assert response.status_code == 409
        assert forward.call_args.args[0] == str(create_user.id)


@pytest.mark.unit
@pytest.mark.django_db
def test_project_workflows_use_authenticated_human_identity(create_user, monkeypatch):
    from unittest.mock import patch
    from plane.db.models import Workspace
    monkeypatch.setenv("FLOW_DESK_DESKTOP_MODE", "true")
    Workspace.objects.create(name="Local", slug="flow-desk", owner=create_user)
    client = APIClient()
    assert client.post("/api/flow-desk/desktop/project-workflows/", {}, format="json").status_code == 401
    client.force_authenticate(user=create_user)
    with patch("plane.flow_desk.desktop.forward_project_request", return_value=({"status": "passed"}, 200)) as forward:
        response = client.post("/api/flow-desk/desktop/project-workflows/", {"operation": "decision", "actor": "forged", "input": {"decision": "approve"}}, format="json")
        assert response.status_code == 200
        assert forward.call_args.args[0] == str(create_user.id)


@pytest.mark.unit
@pytest.mark.django_db
def test_project_artifact_uses_human_authorization_and_returns_exact_image(create_user, monkeypatch):
    import base64
    from unittest.mock import patch
    from plane.db.models import Workspace
    monkeypatch.setenv("FLOW_DESK_DESKTOP_MODE", "true")
    Workspace.objects.create(name="Local", slug="flow-desk", owner=create_user)
    client = APIClient()
    url = "/api/flow-desk/desktop/project-artifacts/run-1/64fbcf0a-50e6-4555-967a-2f3c7202d781/"
    assert client.get(url).status_code == 401
    client.force_authenticate(user=create_user)
    image = b"actual-png-bytes"
    with patch("plane.flow_desk.desktop.forward_project_request", return_value=({"mimeType": "image/png", "base64": base64.b64encode(image).decode()}, 200)) as forward:
        response = client.get(url)
        assert response.status_code == 200
        assert response.content == image
        assert response["Content-Type"] == "image/png"
        assert response["X-Content-Type-Options"] == "nosniff"
        assert forward.call_args.args[0] == str(create_user.id)
        assert forward.call_args.args[1] == "artifact"
