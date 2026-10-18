import React, { useState } from "react";

export type ConfirmPanelProps = {
  visible: boolean;
  options: Array<{ id: string; label: string; requiresReason?: boolean }>;
  submitting?: boolean;
  result?: string;
  error?: string;
  onSubmit: (optionId: string, reason?: string) => Promise<void> | void;
};

export function ConfirmPanel(props: ConfirmPanelProps) {
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(Boolean(props.result));

  if (!props.visible) return null;
  if (collapsed && props.result) {
    return <div data-testid="confirm-panel-done">{props.result}</div>;
  }

  const submit = async (optionId: string, requiresReason?: boolean) => {
    if (pending || props.submitting) return;
    if (requiresReason && !reason.trim()) return;
    setPending(optionId);
    try {
      await props.onSubmit(optionId, reason.trim() || undefined);
      setCollapsed(true);
    } catch {
      // stay open; parent sets error
    } finally {
      setPending(null);
    }
  };

  return (
    <div data-testid="confirm-panel">
      {props.options.map((opt) => (
        <div key={opt.id}>
          {opt.requiresReason ? (
            <input
              data-testid={`confirm-reason-${opt.id}`}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="退回原因"
            />
          ) : null}
          <button
            type="button"
            data-testid={`confirm-option-${opt.id}`}
            disabled={Boolean(pending) || (opt.requiresReason && !reason.trim())}
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
