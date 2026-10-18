import React, { useState } from "react";

export type MetricsDashboardProps = {
  state: "loading" | "ready" | "empty" | "error";
  error?: string;
  metrics?: {
    handlingTime: { medianMs: number; p90Ms: number };
    confirmPassRate: { rate: number };
    rejectReasons: { counts: Record<string, number>; recent: Array<{ category: string; reason: string }> };
    escapeRate: { rate: number; escapes: number; merges: number };
    agentDuration: { medianMs: number };
  };
  areas?: string[];
  flowTypes?: string[];
  onFilter?: (f: { area?: string; flowType?: string }) => void;
  onRetry?: () => void;
};

export function MetricsDashboard(props: MetricsDashboardProps) {
  const [area, setArea] = useState("");
  const [flowType, setFlowType] = useState("");

  if (props.state === "loading") return <div data-testid="metrics-loading">加载中</div>;
  if (props.state === "error") {
    return (
      <div data-testid="metrics-error">
        <p>{props.error ?? "error"}</p>
        <button type="button" data-testid="metrics-retry" onClick={() => props.onRetry?.()}>
          重试
        </button>
      </div>
    );
  }
  if (props.state === "empty" || !props.metrics) {
    return <div data-testid="metrics-empty">暂无指标数据</div>;
  }

  const m = props.metrics;
  return (
    <div data-testid="metrics-dashboard">
      <select
        data-testid="metrics-filter-area"
        value={area}
        onChange={(e) => {
          setArea(e.target.value);
          props.onFilter?.({ area: e.target.value || undefined, flowType: flowType || undefined });
        }}
      >
        <option value="">全部区域</option>
        {(props.areas ?? []).map((a) => (
          <option key={a} value={a}>
            {a}
          </option>
        ))}
      </select>
      <select
        data-testid="metrics-filter-flow"
        value={flowType}
        onChange={(e) => {
          setFlowType(e.target.value);
          props.onFilter?.({ area: area || undefined, flowType: e.target.value || undefined });
        }}
      >
        <option value="">全部流程</option>
        {(props.flowTypes ?? []).map((f) => (
          <option key={f} value={f}>
            {f}
          </option>
        ))}
      </select>
      <div data-testid="metrics-handling">median={m.handlingTime.medianMs} p90={m.handlingTime.p90Ms}</div>
      <div data-testid="metrics-pass-rate">rate={m.confirmPassRate.rate}</div>
      <div data-testid="metrics-rejects">{JSON.stringify(m.rejectReasons.counts)}</div>
      <div data-testid="metrics-escape">rate={m.escapeRate.rate}</div>
      <div data-testid="metrics-agent">median={m.agentDuration.medianMs}</div>
    </div>
  );
}
