import React, { useState } from "react";

export type DispatchDialogProps = {
  open: boolean;
  areas: string[];
  flowTypes: string[];
  flowTypesError?: string;
  onClose: () => void;
  onSubmit: (input: { title: string; area: string; flowType: string }) => Promise<void> | void;
};

export function DispatchDialog(props: DispatchDialogProps) {
  const [title, setTitle] = useState("");
  const [area, setArea] = useState("");
  const [flowType, setFlowType] = useState("");
  const [missing, setMissing] = useState<string[]>([]);

  if (!props.open) return null;

  const submit = async () => {
    const miss: string[] = [];
    if (!title.trim()) miss.push("title");
    if (!area) miss.push("area");
    if (!flowType) miss.push("flowType");
    setMissing(miss);
    if (miss.length || props.flowTypesError) return;
    await props.onSubmit({ title: title.trim(), area, flowType });
    props.onClose();
  };

  return (
    <div data-testid="dispatch-dialog">
      {props.flowTypesError ? (
        <p data-testid="dispatch-error">{props.flowTypesError}</p>
      ) : null}
      <input data-testid="dispatch-title" value={title} onChange={(e) => setTitle(e.target.value)} />
      <select data-testid="dispatch-area" value={area} onChange={(e) => setArea(e.target.value)}>
        <option value="">选择区域</option>
        {props.areas.map((a) => (
          <option key={a} value={a}>
            {a}
          </option>
        ))}
      </select>
      <select
        data-testid="dispatch-flow-type"
        value={flowType}
        onChange={(e) => setFlowType(e.target.value)}
        disabled={Boolean(props.flowTypesError)}
      >
        <option value="">选择流程</option>
        {props.flowTypes.map((f) => (
          <option key={f} value={f}>
            {f}
          </option>
        ))}
      </select>
      {missing.length ? <p data-testid="dispatch-missing">{missing.join(",")}</p> : null}
      <button type="button" data-testid="dispatch-submit" onClick={() => void submit()}>
        提交
      </button>
    </div>
  );
}
