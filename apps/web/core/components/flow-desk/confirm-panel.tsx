import React, { useState } from "react";

export type ConfirmVisualChange = {
  page: string;
  before: string;
  after: string;
};

export const REJECT_CATEGORIES = ["需求理解", "实现错误", "测试不足", "范围", "其他"] as const;

export type ConfirmPanelProps = {
  visible: boolean;
  options: Array<{ id: string; label: string; requiresReason?: boolean }>;
  submitting?: boolean;
  result?: string;
  error?: string;
  visualChanges?: ConfirmVisualChange[];
  /** when true, reject requires category + reason (P46) */
  requireRejectCategory?: boolean;
  onSubmit: (optionId: string, reason?: string, category?: string) => Promise<void> | void;
};

export function ConfirmPanel(props: ConfirmPanelProps) {
  const [reason, setReason] = useState("");
  const [category, setCategory] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(Boolean(props.result));

  if (!props.visible) return null;
  if (collapsed && props.result) {
    return <div data-testid="confirm-panel-done">{props.result}</div>;
  }

  const submit = async (optionId: string, requiresReason?: boolean) => {
    if (pending || props.submitting) return;
    if (requiresReason && !reason.trim()) return;
    if (requiresReason && props.requireRejectCategory && !category) return;
    setPending(optionId);
    try {
      await props.onSubmit(optionId, reason.trim() || undefined, category || undefined);
      setCollapsed(true);
    } catch {
      // stay open; parent sets error
    } finally {
      setPending(null);
    }
  };

  const diffs = props.visualChanges ?? [];

  return (
    <div data-testid="confirm-panel">
      {diffs.length > 0 ? (
        <div data-testid="confirm-visual-diffs">
          {diffs.map((d) => (
            <div key={d.page} data-testid={`confirm-visual-page-${d.page}`}>
              <span>{d.page}</span>
              <img data-testid={`confirm-visual-before-${d.page}`} src={d.before} alt={`${d.page} before`} />
              <img data-testid={`confirm-visual-after-${d.page}`} src={d.after} alt={`${d.page} after`} />
            </div>
          ))}
        </div>
      ) : null}
      {props.options.map((opt) => (
        <div key={opt.id}>
          {opt.requiresReason ? (
            <>
              {props.requireRejectCategory ? (
                <select
                  data-testid={`confirm-category-${opt.id}`}
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                >
                  <option value="">选择类别</option>
                  {REJECT_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              ) : null}
              <input
                data-testid={`confirm-reason-${opt.id}`}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="退回原因"
              />
            </>
          ) : null}
          <button
            type="button"
            data-testid={`confirm-option-${opt.id}`}
            disabled={
              Boolean(pending) ||
              (opt.requiresReason && !reason.trim()) ||
              (opt.requiresReason && props.requireRejectCategory && !category)
            }
            onClick={() => void submit(opt.id, opt.requiresReason)}
          >
            {opt.label}
          </button>
        </div>
      ))}
      {props.error ? <p data-testid="confirm-error">{props.error}</p> : null}
    </div>
  );
}
