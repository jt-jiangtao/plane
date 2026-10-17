/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { CircleDot, XCircle } from "lucide-react";
import { RelatedIcon, DuplicatePropertyIcon } from "@plane/propel/icons";
import type { TRelationObject } from "@/components/issues/issue-detail-widgets/relations";
import type { TIssueRelationTypes } from "@plane/types";

export const ISSUE_RELATION_OPTIONS: Record<TIssueRelationTypes, TRelationObject> = {
  relates_to: {
    key: "relates_to",
    i18n_label: "issue.relation.relates_to",
    className: "bg-layer-1 text-secondary",
    icon: (size) => <RelatedIcon height={size} width={size} className="text-secondary" />,
    placeholder: "Add related work items",
  },
  duplicate: {
    key: "duplicate",
    i18n_label: "issue.relation.duplicate",
    className: "bg-layer-1 text-secondary",
    icon: (size) => <DuplicatePropertyIcon width={size} height={size} className="text-secondary" />,
    placeholder: "None",
  },
  blocked_by: {
    key: "blocked_by",
    i18n_label: "issue.relation.blocked_by",
    className: "bg-danger-subtle text-danger-primary",
    icon: (size) => <CircleDot size={size} className="text-secondary" />,
    placeholder: "None",
  },
  blocking: {
    key: "blocking",
    i18n_label: "issue.relation.blocking",
    className: "bg-yellow-500/20 text-yellow-700",
    icon: (size) => <XCircle size={size} className="text-secondary" />,
    placeholder: "None",
  },
  originated_from: {
    key: "originated_from",
    i18n_label: "issue.relation.originated_from",
    className: "bg-layer-1 text-secondary",
    icon: (size) => <RelatedIcon height={size} width={size} className="text-secondary" />,
    placeholder: "None",
  },
  originates: {
    key: "originates",
    i18n_label: "issue.relation.originates",
    className: "bg-layer-1 text-secondary",
    icon: (size) => <RelatedIcon height={size} width={size} className="text-secondary" />,
    placeholder: "None",
  },
  follow_up: {
    key: "follow_up",
    i18n_label: "issue.relation.follow_up",
    className: "bg-layer-1 text-secondary",
    icon: (size) => <RelatedIcon height={size} width={size} className="text-secondary" />,
    placeholder: "None",
  },
  followed_by: {
    key: "followed_by",
    i18n_label: "issue.relation.followed_by",
    className: "bg-layer-1 text-secondary",
    icon: (size) => <RelatedIcon height={size} width={size} className="text-secondary" />,
    placeholder: "None",
  },
  discovered_in: {
    key: "discovered_in",
    i18n_label: "issue.relation.discovered_in",
    className: "bg-layer-1 text-secondary",
    icon: (size) => <RelatedIcon height={size} width={size} className="text-secondary" />,
    placeholder: "None",
  },
  discovers: {
    key: "discovers",
    i18n_label: "issue.relation.discovers",
    className: "bg-layer-1 text-secondary",
    icon: (size) => <RelatedIcon height={size} width={size} className="text-secondary" />,
    placeholder: "None",
  },
};

export const useTimeLineRelationOptions = () => ISSUE_RELATION_OPTIONS;
