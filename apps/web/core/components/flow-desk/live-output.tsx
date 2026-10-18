import React, { useEffect, useState } from "react";

export type LiveOutputProps = {
  taskId: string;
  running: boolean;
  fetchChunk: (cursor: number) => Promise<{ text: string; nextCursor: number; done: boolean }>;
  pollMs?: number;
};

export function LiveOutput(props: LiveOutputProps) {
  const [lines, setLines] = useState("");
  const [cursor, setCursor] = useState(0);
  const [collapsed, setCollapsed] = useState(!props.running);

  useEffect(() => {
    if (!props.running) {
      setCollapsed(true);
      return;
    }
    setCollapsed(false);
    let cancelled = false;
    const tick = async () => {
      const chunk = await props.fetchChunk(cursor);
      if (cancelled) return;
      if (chunk.text) setLines((prev) => prev + chunk.text);
      setCursor(chunk.nextCursor);
    };
    const id = setInterval(() => void tick(), props.pollMs ?? 1000);
    void tick();
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [props.running, props.taskId]);

  return (
    <div data-testid="live-output" data-collapsed={collapsed ? "true" : "false"}>
      <pre data-testid="live-output-text">{lines}</pre>
    </div>
  );
}
