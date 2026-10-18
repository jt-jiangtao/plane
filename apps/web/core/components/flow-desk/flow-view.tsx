import React from "react";

import { executionLink } from "../../services/flow-desk/links";

export type FlowNode = {
  id: string;
  label: string;
  status: string;
  attempt: number;
  assignee?: string;
  childIssueId?: string;
  current?: boolean;
};

export type FlowViewProps = {
  state: "loading" | "empty" | "error" | "ready";
  error?: string;
  nodes?: FlowNode[];
  edges?: Array<{ from: string; to: string }>;
  executionId?: string;
  onRetry?: () => void;
  onNodeClick?: (node: FlowNode) => void;
};

export function FlowView(props: FlowViewProps) {
  if (props.state === "loading") {
    return <div data-testid="flow-view-loading">加载中…</div>;
  }
  if (props.state === "empty") {
    return null;
  }
  if (props.state === "error") {
    return (
      <div data-testid="flow-view-error">
        <p>{props.error ?? "加载失败"}</p>
        <button type="button" onClick={props.onRetry}>
          重试
        </button>
      </div>
    );
  }

  const nodes = props.nodes ?? [];
  return (
    <div data-testid="flow-view">
      <div data-testid="flow-nodes">
        {nodes.map((n) => (
          <button
            key={n.id}
            type="button"
            data-testid={`flow-node-${n.id}`}
            data-current={n.current ? "true" : "false"}
            onClick={() => props.onNodeClick?.(n)}
          >
            <span>{n.label}</span>
            <span data-testid={`flow-node-status-${n.id}`}>{n.status}</span>
            <span data-testid={`flow-node-attempt-${n.id}`}>#{n.attempt}</span>
            {n.assignee ? <span>{n.assignee}</span> : null}
          </button>
        ))}
      </div>
      {props.executionId ? (
        <a data-testid="flow-open-n8n" href={executionLink(props.executionId)}>
          在 n8n 中查看
        </a>
      ) : null}
    </div>
  );
}
