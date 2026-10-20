"""Project-scoped and idempotent changes requested by workflow work-item nodes."""
import hashlib
import html
import json

from django.db import transaction
from django.core.exceptions import ValidationError
from rest_framework.response import Response

from plane.db.models import Issue, IssueLabel, IssueRelation, Label, Project, State
from plane.db.models.issue import IssueRelationChoices


@transaction.atomic
def apply_issue_operation(request, issue_id):
    data = request.data
    if not isinstance(data, dict):
        return Response({"error": "invalid operation"}, status=400)
    operation = data.get("operation")
    allowed = {"operation", "project", "sourceKey"}
    allowed |= {"title", "stateGroup", "labels", "description"} if operation == "update" else {"targetId", "relation"}
    if operation not in {"update", "link"} or set(data) - allowed:
        return Response({"error": "invalid operation fields"}, status=400)
    source = data.get("sourceKey")
    if not isinstance(source, str) or not source or len(source) > 512:
        return Response({"error": "an operation identity is required"}, status=400)
    project = Project.objects.select_for_update().filter(identifier=data.get("project"), deleted_at__isnull=True).first()
    if project is None:
        return Response({"error": "not found"}, status=404)
    issue = Issue.objects.select_for_update().filter(pk=issue_id, project=project, deleted_at__isnull=True).first()
    if issue is None:
        return Response({"error": "not found"}, status=404)
    digest = hashlib.sha256(json.dumps(data, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()).hexdigest()
    metadata = dict(issue.description_json or {})
    receipts = dict(metadata.get("flowDeskOperations", {}))
    if source in receipts:
        if receipts[source]["digest"] != digest:
            return Response({"error": "conflicting operation retry"}, status=409)
        return Response({**receipts[source]["result"], "replayed": True})
    if operation == "update":
        fields = set(data) - {"operation", "project", "sourceKey"}
        if not fields:
            return Response({"error": "no update fields"}, status=400)
        if "title" in fields and (not isinstance(data["title"], str) or not data["title"].strip() or len(data["title"]) > 255):
            return Response({"error": "invalid title"}, status=400)
        if "description" in fields and (not isinstance(data["description"], str) or len(data["description"]) > 100000):
            return Response({"error": "invalid description"}, status=400)
        labels = data.get("labels")
        if "labels" in fields and (not isinstance(labels, list) or len(labels) > 100 or any(not isinstance(label, str) or not label.strip() or len(label) > 80 for label in labels)):
            return Response({"error": "invalid labels"}, status=400)
        state = None
        if "stateGroup" in fields:
            if not isinstance(data["stateGroup"], str) or data["stateGroup"] not in {"backlog", "unstarted", "started", "completed", "cancelled"}:
                return Response({"error": "invalid state group"}, status=400)
            state = State.objects.filter(project=project, group=data["stateGroup"], deleted_at__isnull=True).order_by("sequence", "id").first()
            if state is None:
                return Response({"error": "project state is not configured"}, status=409)
        if "title" in fields:
            issue.name = data["title"].strip()
        if state is not None:
            issue.state = state
        if "description" in fields:
            # Keep the original scan evidence and append an escaped workflow note.
            note = data["description"]
            issue.description_stripped = (issue.description_stripped or "") + "\n" + note
            issue.description_html = (issue.description_html or "") + "<p>" + html.escape(note) + "</p>"
        if "labels" in fields:
            IssueLabel.objects.filter(issue=issue).delete()
            for name in sorted(set(labels)):
                label, _ = Label.objects.get_or_create(project=project, name=name, defaults={"workspace": project.workspace})
                IssueLabel.objects.get_or_create(issue=issue, label=label, defaults={"project": project, "workspace": project.workspace})
        result = {"id": str(issue.id), "updated": True}
    else:
        relation = data.get("relation")
        if not isinstance(relation, str):
            return Response({"error": "invalid relation"}, status=400)
        reverse = IssueRelationChoices._REVERSE_MAPPING.get(relation)
        if reverse is None or str(data.get("targetId")) == str(issue.id):
            return Response({"error": "invalid relation"}, status=400)
        try:
            target = Issue.objects.filter(pk=data.get("targetId"), project=project, deleted_at__isnull=True).first()
        except (ValueError, TypeError, ValidationError):
            return Response({"error": "invalid related work item"}, status=400)
        if target is None:
            return Response({"error": "related work item is outside this project"}, status=404)
        pairs = [(issue, target, relation), (target, issue, reverse)]
        for first, second, kind in pairs:
            existing = IssueRelation.objects.filter(issue=first, related_issue=second).first()
            if existing and existing.relation_type != kind:
                return Response({"error": "a different relation already exists"}, status=409)
        for first, second, kind in pairs:
            IssueRelation.objects.get_or_create(issue=first, related_issue=second, defaults={"project": project, "workspace": project.workspace, "relation_type": kind})
        result = {"id": str(issue.id), "targetId": str(target.id), "relation": relation, "linked": True}
    receipts[source] = {"digest": digest, "result": result}
    metadata["flowDeskOperations"] = receipts
    issue.description_json = metadata
    issue.save()
    return Response({**result, "replayed": False})
