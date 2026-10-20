"""Authenticated Plane bridge for autonomous project workflows."""
import hmac
import os
from pathlib import Path
from rest_framework.views import APIView
from rest_framework.response import Response

def enabled():
    return os.environ.get("FLOW_DESK_DESKTOP_MODE") == "true"

def forward_project_request(actor, operation, body):
    import base64
    import hashlib
    import json
    import time
    import uuid
    from urllib.error import HTTPError
    from urllib.request import Request, urlopen
    secret = Path(os.environ.get("FLOW_DESK_DESKTOP_SECRET_FILE", "/tmp/flow-desk-desktop-token")).read_text().strip()
    envelope = {"actor": actor, "operation": operation, "input": body, "issuedAt": int(time.time() * 1000), "nonce": str(uuid.uuid4())}
    encoded = base64.urlsafe_b64encode(json.dumps(envelope, ensure_ascii=False, separators=(",", ":")).encode()).rstrip(b"=").decode()
    signature = hmac.new(secret.encode(), encoded.encode(), hashlib.sha256).hexdigest()
    target = os.environ.get("FLOW_DESK_N8N_URL", "http://n8n:5678").rstrip("/")
    request = Request(target + "/rest/flow-desk/projects/desktop", data=b"{}", method="POST", headers={"Content-Type": "application/json", "X-Flow-Desk-Human-Assertion": encoded + "." + signature})
    try:
        with urlopen(request, timeout=30) as response:
            return json.load(response), response.status
    except HTTPError as error:
        try:
            return json.load(error), error.code
        except ValueError:
            return {"error": "project workflow request failed"}, error.code


class DesktopProjectWorkflowsProxy(APIView):
    def post(self, request):
        if not enabled():
            return Response({"error": "not found"}, status=404)
        if not request.user.is_authenticated:
            return Response({"error": "unauthorized"}, status=401)
        from plane.db.models import Workspace
        if request.user.is_bot or not request.user.is_active or not Workspace.objects.filter(slug="flow-desk", owner=request.user).exists():
            return Response({"error": "human workspace owner required"}, status=403)
        operation = request.data.get("operation")
        if operation not in ("list", "candidate", "activate", "start", "inspect", "decision", "cancel", "propose", "artifact", "onboard", "onboarding", "migration-propose", "migration-candidate", "migration-trial", "migration-trials", "migration-activate", "migration-rollback", "migration-prepare", "migration-preparing", "migration-cancel"):
            return Response({"error": "unknown project operation"}, status=400)
        try:
            data, code = forward_project_request(str(request.user.id), operation, request.data.get("input") or {})
            return Response(data, status=code)
        except (OSError, ValueError):
            return Response({"error": "project workflow service unavailable"}, status=503)


class DesktopProjectArtifactProxy(APIView):
    def get(self, request, run_id, artifact_id):
        if not enabled() or not request.user.is_authenticated or request.user.is_bot:
            return Response({"error": "unauthorized"}, status=401)
        from plane.db.models import Workspace
        if not Workspace.objects.filter(slug="flow-desk", owner=request.user).exists():
            return Response({"error": "human workspace owner required"}, status=403)
        import base64
        from django.http import HttpResponse
        try:
            data, code = forward_project_request(str(request.user.id), "artifact", {"runId": run_id, "artifactId": str(artifact_id)})
            if code != 200:
                return Response(data, status=code)
            value = base64.b64decode(data["base64"]) if "base64" in data else str(data.get("text", "")).encode()
            response = HttpResponse(value, content_type=data.get("mimeType") or "application/octet-stream")
            response["X-Content-Type-Options"] = "nosniff"
            response["Cache-Control"] = "private, immutable"
            return response
        except (OSError, ValueError, KeyError):
            return Response({"error": "artifact unavailable"}, status=503)
