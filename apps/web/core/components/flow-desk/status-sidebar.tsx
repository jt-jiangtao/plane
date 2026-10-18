import React from "react";

export type StatusSidebarProps = {
  n8nOk: boolean;
  runnerOk: boolean;
  configOk: boolean;
  n8nError?: string;
  runningTasks: Array<{ taskId: string; childIssueId: string; label: string }>;
  onTaskClick?: (taskId: string) => void;
};

export function StatusSidebar(props: StatusSidebarProps) {
  const hasFlowDesk = typeof window !== "undefined" && Boolean((window as { flowDesk?: unknown }).flowDesk);

  return (
    <div data-testid="flow-desk-status">
      <p data-testid="status-n8n">{props.n8nOk ? "n8n:ok" : `n8n:down ${props.n8nError ?? ""}`}</p>
      <p data-testid="status-runner">{props.runnerOk ? "runner:ok" : "runner:down"}</p>
      <p data-testid="status-config">{props.configOk ? "config:ok" : "config:error"}</p>
      <p data-testid="status-running-count">{props.runningTasks.length}</p>
      <ul>
        {props.runningTasks.map((t) => (
          <li key={t.taskId}>
            <button type="button" data-testid={`running-task-${t.taskId}`} onClick={() => props.onTaskClick?.(t.taskId)}>
              {t.label}
            </button>
          </li>
        ))}
      </ul>
      {!props.n8nOk && hasFlowDesk ? (
        <button type="button" data-testid="restart-n8n">
          重启 n8n
        </button>
      ) : null}
    </div>
  );
}
