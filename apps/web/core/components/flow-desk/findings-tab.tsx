import React, { useMemo, useState } from "react";

export type FindingRow = {
  fingerprint: string;
  rule: string;
  level: "error" | "warning" | "info";
  status: "new" | "existing" | "fixed" | "ignored";
  kind: "ui" | "code";
  message: string;
};

export type FindingActionChoice = "create" | "ignore" | "defer";

export type FindingsTabProps = {
  state: "loading" | "empty" | "error" | "ready";
  findings?: FindingRow[];
  awaitingActions?: boolean;
  error?: string;
  onRetry?: () => void;
  onSubmitActions?: (
    actions: Array<{ fingerprint: string; action: FindingActionChoice; reason?: string; createAs?: string }>
  ) => Promise<void> | void;
};

export function FindingsTab(props: FindingsTabProps) {
  const [kind, setKind] = useState<string>("all");
  const [level, setLevel] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [choices, setChoices] = useState<Record<string, FindingActionChoice>>({});
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const filtered = useMemo(() => {
    return (props.findings ?? []).filter((f) => {
      if (kind !== "all" && f.kind !== kind) return false;
      if (level !== "all" && f.level !== level) return false;
      if (status !== "all" && f.status !== status) return false;
      return true;
    });
  }, [props.findings, kind, level, status]);

  if (props.state === "loading") {
    return <div data-testid="findings-tab-loading">加载中</div>;
  }
  if (props.state === "empty") {
    return <div data-testid="findings-tab-empty">暂无发现</div>;
  }
  if (props.state === "error") {
    return (
      <div data-testid="findings-tab-error">
        <p>{props.error ?? "加载失败"}</p>
        <button type="button" onClick={props.onRetry}>
          重试
        </button>
      </div>
    );
  }

  const allChosen =
    !props.awaitingActions ||
    (props.findings ?? []).every((f) => {
      const action = choices[f.fingerprint];
      if (!action) return false;
      if (action === "ignore" && !reasons[f.fingerprint]?.trim()) return false;
      return true;
    });

  const submit = async () => {
    if (!props.onSubmitActions || submitting || !allChosen) return;
    setSubmitting(true);
    try {
      await props.onSubmitActions(
        (props.findings ?? []).map((f) => ({
          fingerprint: f.fingerprint,
          action: choices[f.fingerprint],
          reason: reasons[f.fingerprint],
          createAs: f.kind === "ui" ? (f.level === "error" ? "bug-standard" : "feature-small") : undefined,
        }))
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div data-testid="findings-tab">
      <div data-testid="findings-filters">
        <select data-testid="filter-kind" value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="all">全部种类</option>
          <option value="ui">界面</option>
          <option value="code">代码</option>
        </select>
        <select data-testid="filter-level" value={level} onChange={(e) => setLevel(e.target.value)}>
          <option value="all">全部级别</option>
          <option value="error">错误</option>
          <option value="warning">警告</option>
        </select>
        <select data-testid="filter-status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="all">全部状态</option>
          <option value="new">新增</option>
          <option value="existing">已存在</option>
          <option value="ignored">已忽略</option>
        </select>
      </div>
      <ul data-testid="findings-list">
        {filtered.map((f) => (
          <li key={f.fingerprint} data-testid={`finding-${f.fingerprint}`}>
            <span data-testid={`finding-msg-${f.fingerprint}`}>{f.message}</span>
            {props.awaitingActions ? (
              <div data-testid={`finding-actions-${f.fingerprint}`}>
                {(["create", "ignore", "defer"] as FindingActionChoice[]).map((a) => (
                  <button
                    key={a}
                    type="button"
                    data-testid={`finding-action-${f.fingerprint}-${a}`}
                    onClick={() => setChoices((c) => ({ ...c, [f.fingerprint]: a }))}
                  >
                    {a === "create" ? "建单" : a === "ignore" ? "忽略" : "暂不处理"}
                  </button>
                ))}
                {choices[f.fingerprint] === "ignore" ? (
                  <input
                    data-testid={`finding-reason-${f.fingerprint}`}
                    value={reasons[f.fingerprint] ?? ""}
                    onChange={(e) => setReasons((r) => ({ ...r, [f.fingerprint]: e.target.value }))}
                    placeholder="忽略原因"
                  />
                ) : null}
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      {props.awaitingActions ? (
        <button
          type="button"
          data-testid="findings-submit-actions"
          disabled={!allChosen || submitting}
          onClick={() => void submit()}
        >
          提交处理
        </button>
      ) : null}
    </div>
  );
}
