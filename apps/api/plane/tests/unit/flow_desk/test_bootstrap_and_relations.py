# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import json
from io import StringIO

import pytest
from django.core.management import call_command

from plane.db.models import APIToken, Issue, IssueRelation, Project, User, Workspace
from plane.db.models.issue import IssueRelationChoices

FLOW_DESK_RELATION_TYPES = (
    IssueRelationChoices.ORIGINATED_FROM,
    IssueRelationChoices.FOLLOW_UP,
    IssueRelationChoices.DISCOVERED_IN,
)


@pytest.mark.unit
class TestFlowDeskBootstrap:
    """P29 / P30: flow_desk_bootstrap creates and repairs system objects."""

    @pytest.mark.django_db
    def test_p29_first_bootstrap_creates_workspace_project_users_and_tokens(self):
        out = StringIO()
        call_command("flow_desk_bootstrap", stdout=out)
        payload = json.loads(out.getvalue())

        assert "workspaceSlug" in payload
        assert "systemProjectIdentifier" in payload
        assert "tokens" in payload
        assert payload["tokens"]["flowDesk"]
        assert payload["tokens"]["agentBot"]

        workspace = Workspace.objects.get(slug=payload["workspaceSlug"])
        Project.objects.get(workspace=workspace, identifier=payload["systemProjectIdentifier"])

        flow_desk_user = User.objects.get(email="flow-desk@flow-desk.local")
        agent_bot_user = User.objects.get(email="agent-bot@flow-desk.local")
        assert flow_desk_user.is_bot is True
        assert agent_bot_user.is_bot is True

        assert APIToken.objects.filter(user=flow_desk_user, workspace=workspace, is_active=True).exists()
        assert APIToken.objects.filter(user=agent_bot_user, workspace=workspace, is_active=True).exists()

    @pytest.mark.django_db
    def test_p30_rerun_is_idempotent_and_repairs_missing_objects(self):
        out1 = StringIO()
        call_command("flow_desk_bootstrap", stdout=out1)
        first = json.loads(out1.getvalue())

        workspace = Workspace.objects.get(slug=first["workspaceSlug"])
        project = Project.objects.get(workspace=workspace, identifier=first["systemProjectIdentifier"])
        project_id = project.id
        User.objects.filter(email="agent-bot@flow-desk.local").delete()

        out2 = StringIO()
        call_command("flow_desk_bootstrap", stdout=out2)
        second = json.loads(out2.getvalue())

        assert second["workspaceSlug"] == first["workspaceSlug"]
        assert second["systemProjectIdentifier"] == first["systemProjectIdentifier"]
        assert Workspace.objects.filter(slug=first["workspaceSlug"]).count() == 1
        assert Project.objects.filter(id=project_id).count() == 1
        assert User.objects.filter(email="flow-desk@flow-desk.local").count() == 1
        assert User.objects.filter(email="agent-bot@flow-desk.local").count() == 1
        assert second["tokens"]["agentBot"]
        assert second["tokens"]["flowDesk"]


@pytest.mark.unit
class TestFlowDeskRelations:
    """P36: originated_from / follow_up / discovered_in can be created and listed."""

    @pytest.mark.django_db
    def test_p36_create_and_list_new_relation_types(self, create_user):
        workspace = Workspace.objects.create(name="Flow Desk WS", slug="flow-desk-ws", owner=create_user)
        project = Project.objects.create(
            name="Demo",
            identifier="DEMO",
            workspace=workspace,
            created_by=create_user,
            updated_by=create_user,
        )
        # Plane unique constraint is (issue, related_issue); use distinct pairs per type.
        created_types: list[str] = []
        for index, relation_type in enumerate(FLOW_DESK_RELATION_TYPES):
            issue_a = Issue.objects.create(
                name=f"A-{index}",
                project=project,
                workspace=workspace,
                created_by=create_user,
            )
            issue_b = Issue.objects.create(
                name=f"B-{index}",
                project=project,
                workspace=workspace,
                created_by=create_user,
            )
            relation = IssueRelation.objects.create(
                issue=issue_a,
                related_issue=issue_b,
                relation_type=relation_type,
                project=project,
                workspace=workspace,
            )
            assert relation.id is not None
            created_types.append(relation.relation_type)
            assert relation_type in IssueRelationChoices.values
            assert relation_type in IssueRelationChoices._REVERSE_MAPPING

        for relation_type in FLOW_DESK_RELATION_TYPES:
            assert relation_type in created_types
