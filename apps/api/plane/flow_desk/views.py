# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from __future__ import annotations

import hashlib
import html
import hmac
import json
import os
import uuid

from django.conf import settings
from django.db import transaction
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


def _plane_issue_id(value) -> str | None:
    if not value:
        return None
    try:
        return str(uuid.UUID(str(value)))
    except (ValueError, TypeError, AttributeError):
        return None


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


class FlowDeskInternalProjectsEndpoint(APIView):
    authentication_classes = []
    permission_classes = []

    @transaction.atomic
    def post(self, request):
        if not _service_token_ok(request):
            return Response({"error": "unauthorized"}, status=401)
        import re
        from plane.db.models import Project, ProjectMember, State, Workspace
        project_id = str(request.data.get("projectId") or "")
        if not re.fullmatch(r"[a-z][a-z0-9-]{0,63}", project_id):
            return Response({"error": "invalid project identity"}, status=400)
        workspace = Workspace.objects.select_for_update().filter(slug="flow-desk").first() or Workspace.objects.select_for_update().first()
        if workspace is None:
            return Response({"error": "workspace is not initialized"}, status=409)
        identifier = "FD" + hashlib.sha256(project_id.encode()).hexdigest()[:8].upper()
        project, created = Project.objects.get_or_create(workspace=workspace, identifier=identifier,
            defaults={"name": str(request.data.get("name") or project_id)[:255], "created_by": workspace.owner})
        ProjectMember.objects.get_or_create(project=project, member=workspace.owner,
            defaults={"role": 20, "is_active": True, "workspace": workspace})
        State.objects.get_or_create(project=project, default=True,
            defaults={"name": "待处理", "workspace": workspace, "group": "backlog"})
        return Response({"id": str(project.id), "identifier": identifier, "created": created}, status=201 if created else 200)


class FlowDeskInternalIssuesEndpoint(APIView):
    authentication_classes = []
    permission_classes = []

    def get(self, request):
        if not _service_token_ok(request):
            return Response({"error": "unauthorized"}, status=401)
        from plane.db.models import Issue, Project
        project = Project.objects.filter(identifier=str(request.query_params.get("project") or "")).first()
        if project is None:
            return Response({"error": "not found"}, status=404)
        issues = Issue.objects.filter(project=project).exclude(state__group__in=["completed", "cancelled"]).select_related("state")
        return Response({"items": [{"id": str(issue.id), "title": issue.name,
            "status": issue.state.name if issue.state else "", "page": (issue.description_json or {}).get("flowDeskScan", {}).get("page", "")}
            for issue in issues]})

    @transaction.atomic
    def post(self, request):
        if not _service_token_ok(request):
            return Response({"error": "unauthorized"}, status=status.HTTP_401_UNAUTHORIZED)
        title = str(request.data.get("title") or "").strip()
        identifier = str(request.data.get("project") or "").strip()
        if not title or not identifier:
            return Response({"error": "missing"}, status=status.HTTP_400_BAD_REQUEST)
        from plane.db.models import Issue, IssueLabel, Label, Project, State
        project = Project.objects.select_for_update().filter(identifier=identifier).first()
        if project is None:
            return Response({"error": "not found"}, status=status.HTTP_404_NOT_FOUND)
        source_key = str(request.data.get("sourceKey") or "")
        page = str(request.data.get("page") or "")
        finding = any(key in request.data for key in ("reproduction", "suggestion", "evidence"))
        fields = {key: request.data.get(key) for key in ("page", "reproduction", "suggestion", "labels", "evidence", "files")}
        evidence = fields["evidence"]
        code_finding = request.data.get("kind") == "code"
        valid_evidence = (
            isinstance(fields["files"], list) and bool(fields["files"])
            and all(isinstance(name, str) and name for name in fields["files"])
            and isinstance(evidence, list) and bool(evidence)
            and all(isinstance(item, dict) and item.get("kind") == "code" and item.get("url") for item in evidence)
        ) if code_finding else (
            isinstance(evidence, list) and len(evidence) >= 2
            and all(isinstance(item, dict) and item.get("kind") == "image" and item.get("url") for item in evidence)
        )
        if finding and (not fields["reproduction"] or not fields["suggestion"] or not valid_evidence):
            return Response({"error": "invalid finding evidence"}, status=400)
        parent_id = _plane_issue_id(request.data.get("parentId"))
        if request.data.get("parentId") and (not parent_id or not Issue.objects.filter(id=parent_id, project=project).exists()):
            return Response({"error": "parent belongs to another project or is missing"}, status=400)
        dedupe_key = hashlib.sha256(json.dumps([str(project.id), title.casefold(), page], ensure_ascii=False).encode()).hexdigest()
        query = Issue.objects.filter(project=project)
        if finding:
            query = query.filter(parent_id=parent_id)
        existing = query.filter(description_json__flowDeskSource=source_key).first() if source_key else None
        if existing is None and finding:
            existing = query.exclude(state__group__in=["completed", "cancelled"]).filter(description_json__flowDeskScan__dedupeKey=dedupe_key).first()
        if existing is not None:
            return Response({"id": str(existing.id), "identifier": f"{project.identifier}-{existing.sequence_id}", "created": False}, status=200)
        state = State.objects.filter(project=project, default=True).first() if finding else (State.objects.filter(project=project, name="进行中").first() or State.objects.filter(project=project, default=True).first())
        metadata = {"type": "doc", "content": [], **({"flowDeskSource": source_key} if source_key else {})}
        text = ""
        if finding:
            metadata["flowDeskScan"] = {**fields, "dedupeKey": dedupe_key}
            text = f"页面：{page}\n复现：{fields['reproduction']}\n建议：{fields['suggestion']}"
        if text:
            metadata["content"] = [{"type": "paragraph", "content": [{"type": "text", "text": text}]}]
        evidence_html = "".join(f'<p><a href="{html.escape(str(item.get("url", "")), quote=True)}">{html.escape(str(item.get("name", "图片证据")))}</a></p>' for item in (fields["evidence"] or [])) if finding else ""
        issue = Issue.objects.create(name=title[:255], project=project, workspace=project.workspace,
            state=state, created_by=project.created_by, parent_id=parent_id,
            description_json=metadata, description_html=f"<p>{html.escape(text)}</p>{evidence_html}", description_stripped=text)
        labels = request.data.get("labels") or []
        if isinstance(labels, str):
            labels = [labels]
        for label_name in labels:
            label, _created = Label.objects.get_or_create(name=str(label_name), project=project, workspace=project.workspace)
            IssueLabel.objects.get_or_create(issue=issue, label=label, project=project, workspace=project.workspace)
        return Response({"id": str(issue.id), "identifier": f"{project.identifier}-{issue.sequence_id}", "created": True}, status=201)


class FlowDeskInternalIssueCommentEndpoint(APIView):
    authentication_classes = []
    permission_classes = []

    def post(self, request, issue_id):
        if not _service_token_ok(request):
            return Response({"error": "unauthorized"}, status=status.HTTP_401_UNAUTHORIZED)
        from plane.db.models import Issue, IssueComment

        issue = Issue.objects.filter(pk=issue_id, deleted_at__isnull=True).first()
        if issue is None:
            return Response({"error": "not found"}, status=status.HTTP_404_NOT_FOUND)
        comment = str(request.data.get("comment") or "").strip()
        if not comment:
            return Response({"error": "missing"}, status=status.HTTP_400_BAD_REQUEST)
        IssueComment.objects.create(
            issue=issue,
            project=issue.project,
            workspace=issue.workspace,
            actor=issue.created_by,
            comment_html=f"<p>{comment}</p>",
        )
        return Response({"ok": True}, status=status.HTTP_201_CREATED)


class FlowDeskInternalIssueEndpoint(APIView):
    authentication_classes = []
    permission_classes = []

    def post(self, request, issue_id):
        if not _service_token_ok(request):
            return Response({"error": "unauthorized"}, status=401)
        from plane.flow_desk.issue_operations import apply_issue_operation

        return apply_issue_operation(request, issue_id)

    def get(self, request, issue_id):
        if not _service_token_ok(request):
            return Response({"error": "unauthorized"}, status=status.HTTP_401_UNAUTHORIZED)
        from plane.db.models import Issue

        issue = (
            Issue.objects.filter(pk=issue_id, deleted_at__isnull=True)
            .select_related("state", "project")
            .first()
        )
        if issue is None:
            return Response({"error": "not found"}, status=status.HTTP_404_NOT_FOUND)
        labels = sorted(issue.labels.values_list("name", flat=True))
        return Response(
            {
                "id": str(issue.id),
                "identifier": f"{issue.project.identifier}-{issue.sequence_id}",
                "stateName": issue.state.name if issue.state_id else "",
                "stateGroup": issue.state.group if issue.state_id else "",
                "labels": labels,
            }
        )


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
