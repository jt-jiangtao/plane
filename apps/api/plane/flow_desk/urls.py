# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.urls import path

from plane.flow_desk.views import (
    FlowDeskCredentialsProxy,
    FlowDeskDecisionsProxy,
    FlowDeskInternalEventsEndpoint,
    FlowDeskSettingsProxy,
    FlowDeskStatusProxy,
)

urlpatterns = [
    path(
        "flow-desk/internal/events/",
        FlowDeskInternalEventsEndpoint.as_view(),
        name="flow-desk-internal-events",
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
]
