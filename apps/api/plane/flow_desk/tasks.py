# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from celery import shared_task

from plane.flow_desk.outbox import cleanup_outbox


@shared_task
def flow_desk_cleanup_outbox():
    return cleanup_outbox()
