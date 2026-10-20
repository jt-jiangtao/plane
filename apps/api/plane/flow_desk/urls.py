# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.urls import path
from plane.flow_desk.desktop import DesktopProjectWorkflowsProxy, DesktopProjectArtifactProxy

from plane.flow_desk.views import (
    FlowDeskCredentialsProxy,
    FlowDeskDecisionsProxy,
    FlowDeskFindingsProxy,
    FlowDeskInternalEventsEndpoint,
    FlowDeskInternalIssueCommentEndpoint,
    FlowDeskInternalIssueEndpoint,
    FlowDeskInternalIssuesEndpoint,
    FlowDeskInternalProjectsEndpoint,
    FlowDeskSettingsProxy,
    FlowDeskStatusProxy,
)

urlpatterns = [
    path("flow-desk/desktop/project-artifacts/<str:run_id>/<uuid:artifact_id>/", DesktopProjectArtifactProxy.as_view()),
    path("flow-desk/internal/projects/", FlowDeskInternalProjectsEndpoint.as_view()),
    path("flow-desk/desktop/project-workflows/", DesktopProjectWorkflowsProxy.as_view()),
    path(
        "flow-desk/internal/events/",
        FlowDeskInternalEventsEndpoint.as_view(),
        name="flow-desk-internal-events",
    ),
    path(
        "flow-desk/internal/issues/",
        FlowDeskInternalIssuesEndpoint.as_view(),
        name="flow-desk-internal-issues",
    ),
    path(
        "flow-desk/internal/issues/<uuid:issue_id>/",
        FlowDeskInternalIssueEndpoint.as_view(),
        name="flow-desk-internal-issue",
    ),
    path(
        "flow-desk/internal/issues/<uuid:issue_id>/comments/",
        FlowDeskInternalIssueCommentEndpoint.as_view(),
        name="flow-desk-internal-issue-comment",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/flow-desk/decisions/",
        FlowDeskDecisionsProxy.as_view(),
        name="flow-desk-decisions-proxy",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/flow-desk/settings/",
        FlowDeskSettingsProxy.as_view(),
        name="flow-desk-settings-proxy",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/flow-desk/status/",
        FlowDeskStatusProxy.as_view(),
        name="flow-desk-status-proxy",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/flow-desk/credentials/cursor/",
        FlowDeskCredentialsProxy.as_view(),
        name="flow-desk-credentials-proxy",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/flow-desk/findings/",
        FlowDeskFindingsProxy.as_view(),
        name="flow-desk-findings-proxy",
    ),
]
