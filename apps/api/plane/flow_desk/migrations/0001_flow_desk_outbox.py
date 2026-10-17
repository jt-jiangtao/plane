# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.db import migrations, models
import django.utils.timezone


class Migration(migrations.Migration):
    initial = True

    dependencies = []

    operations = [
        migrations.CreateModel(
            name="FlowDeskOutbox",
            fields=[
                ("id", models.BigAutoField(primary_key=True, serialize=False)),
                ("kind", models.CharField(choices=[("state", "state"), ("labels", "labels"), ("comment", "comment")], max_length=32)),
                ("issue_id", models.UUIDField(db_index=True)),
                ("project_id", models.UUIDField()),
                ("workspace_id", models.UUIDField()),
                ("actor_id", models.UUIDField(blank=True, null=True)),
                ("payload", models.JSONField(default=dict)),
                ("created_at", models.DateTimeField(db_index=True, default=django.utils.timezone.now)),
            ],
            options={
                "db_table": "flow_desk_outbox",
                "ordering": ("id",),
            },
        ),
        migrations.CreateModel(
            name="FlowDeskOutboxCursor",
            fields=[
                ("id", models.PositiveSmallIntegerField(default=1, primary_key=True, serialize=False)),
                ("last_pulled_id", models.BigIntegerField(default=0)),
            ],
            options={
                "db_table": "flow_desk_outbox_cursor",
            },
        ),
    ]
