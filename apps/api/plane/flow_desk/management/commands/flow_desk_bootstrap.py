# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import json
import uuid

from django.contrib.auth.hashers import make_password
from django.core.management.base import BaseCommand
from django.db import transaction

from plane.db.models import APIToken, Project, ProjectMember, User, Workspace, WorkspaceMember

WORKSPACE_SLUG = "flow-desk"
WORKSPACE_NAME = "Flow Desk"
SYSTEM_PROJECT_IDENTIFIER = "FLOW"
SYSTEM_PROJECT_NAME = "Flow Desk System"
FLOW_DESK_EMAIL = "flow-desk@flow-desk.local"
AGENT_BOT_EMAIL = "agent-bot@flow-desk.local"


class Command(BaseCommand):
    help = "Idempotently bootstrap Flow Desk workspace, system project, bot users, and API tokens"

    @transaction.atomic
    def handle(self, *args, **options):
        owner = self._ensure_owner()
        workspace = self._ensure_workspace(owner)
        project = self._ensure_project(workspace, owner)
        flow_desk_user = self._ensure_bot_user(
            email=FLOW_DESK_EMAIL,
            username="flow-desk",
            display_name="Flow Desk",
            bot_type="flow_desk",
        )
        agent_bot_user = self._ensure_bot_user(
            email=AGENT_BOT_EMAIL,
            username="agent-bot",
            display_name="Agent Bot",
            bot_type="agent_bot",
        )

        for user in (owner, flow_desk_user, agent_bot_user):
            WorkspaceMember.objects.get_or_create(
                workspace=workspace,
                member=user,
                defaults={"role": 20, "is_active": True},
            )
            ProjectMember.objects.get_or_create(
                project=project,
                member=user,
                defaults={"role": 20, "is_active": True},
            )

        flow_desk_token = self._ensure_token(flow_desk_user, workspace, label="flow-desk")
        agent_bot_token = self._ensure_token(agent_bot_user, workspace, label="agent-bot")

        payload = {
            "workspaceSlug": workspace.slug,
            "systemProjectIdentifier": project.identifier,
            "tokens": {
                "flowDesk": flow_desk_token.token,
                "agentBot": agent_bot_token.token,
            },
        }
        self.stdout.write(json.dumps(payload, ensure_ascii=False))

    def _ensure_owner(self) -> User:
        owner, _ = User.objects.get_or_create(
            email="owner@flow-desk.local",
            defaults={
                "username": "flow-desk-owner",
                "display_name": "Flow Desk Owner",
                "first_name": "Flow",
                "last_name": "Desk",
                "is_active": True,
                "password": make_password(uuid.uuid4().hex),
                "is_password_autoset": True,
            },
        )
        return owner

    def _ensure_workspace(self, owner: User) -> Workspace:
        workspace, _ = Workspace.objects.get_or_create(
            slug=WORKSPACE_SLUG,
            defaults={
                "name": WORKSPACE_NAME,
                "owner": owner,
            },
        )
        return workspace

    def _ensure_project(self, workspace: Workspace, owner: User) -> Project:
        project, _ = Project.objects.get_or_create(
            workspace=workspace,
            identifier=SYSTEM_PROJECT_IDENTIFIER,
            defaults={
                "name": SYSTEM_PROJECT_NAME,
                "created_by": owner,
                "updated_by": owner,
            },
        )
        return project

    def _ensure_bot_user(self, *, email: str, username: str, display_name: str, bot_type: str) -> User:
        user, created = User.objects.get_or_create(
            email=email,
            defaults={
                "username": username,
                "display_name": display_name,
                "first_name": display_name,
                "last_name": "",
                "is_bot": True,
                "bot_type": bot_type,
                "is_active": True,
                "password": make_password(uuid.uuid4().hex),
                "is_password_autoset": True,
            },
        )
        if not created and not user.is_bot:
            user.is_bot = True
            user.bot_type = bot_type
            user.save(update_fields=["is_bot", "bot_type"])
        return user

    def _ensure_token(self, user: User, workspace: Workspace, *, label: str) -> APIToken:
        token = APIToken.objects.filter(user=user, workspace=workspace, label=label, is_active=True).first()
        if token:
            return token
        return APIToken.objects.create(
            user=user,
            workspace=workspace,
            label=label,
            user_type=1,
            is_active=True,
        )
