# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Document Flow Desk issue relation choice values.

relation_type is a CharField; new choice values need no schema change.
This migration exists so deploy tooling records the intentional expansion.
"""

from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        ("db", "0122_alter_draftissue_assignees_alter_issue_assignees_and_more"),
    ]

    operations = []
