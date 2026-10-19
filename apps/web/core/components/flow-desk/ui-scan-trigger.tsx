import { useState } from "react";
import { Button } from "@plane/propel/button";

export function UiScanTrigger({ state, onStart }: { state: "ready" | "error"; onStart: () => Promise<void> }) {
  const [error, setError] = useState(state === "error" ? "无法连接流程服务" : "");

  const start = async () => {
    if (state === "error") return;
    try {
      await onStart();
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "无法连接流程服务");
    }
  };

  return (
    <div className="flex items-center gap-3 px-4 py-3">
      {error ? (
        <p role="alert" className="text-13 text-danger-primary">
          {error}
        </p>
      ) : null}
      <Button variant="primary" onClick={() => void start()} disabled={state === "error"}>
        界面扫描
      </Button>
    </div>
  );
}
