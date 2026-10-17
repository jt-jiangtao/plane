/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TIssueRelationTypes } from "@plane/types";

export const REVERSE_RELATIONS: { [key in TIssueRelationTypes]: TIssueRelationTypes } = {
  blocked_by: "blocking",
  blocking: "blocked_by",
  relates_to: "relates_to",
  duplicate: "duplicate",
  originated_from: "originates",
  originates: "originated_from",
  follow_up: "followed_by",
  followed_by: "follow_up",
  discovered_in: "discovers",
  discovers: "discovered_in",
};
