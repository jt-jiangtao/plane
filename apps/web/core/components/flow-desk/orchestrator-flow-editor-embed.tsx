import React, { useMemo, useState } from "react";

const DEFAULT_SRC = "http://127.0.0.1:8790/";
const IFRAME_TITLE = "Orchestrator Flow Editor";

function resolveFlowEditorSrc(): string {
  if (typeof window === "undefined") return DEFAULT_SRC;
  const fromQuery = new URLSearchParams(window.location.search).get("flowEditor");
  if (fromQuery) return fromQuery;
  const fromWindow = (window as Window & { __FLOW_EDITOR_URL__?: string }).__FLOW_EDITOR_URL__;
  if (fromWindow) return fromWindow;
  try {
    const stored = window.localStorage.getItem("flow-desk.flowEditorUrl");
    if (stored) return stored;
  } catch {
    /* ignore */
  }
  return DEFAULT_SRC;
}

/**
 * G1b minimal embed: iframe standalone @flow-desk/flow-editor (React Flow + Agent CLI).
 * Does not depend on n8n. Source of truth remains orchestrator YAML on disk.
 */
export function OrchestratorFlowEditorEmbed(props?: { src?: string; title?: string }) {
  const initial = props?.src ?? resolveFlowEditorSrc();
  const [src, setSrc] = useState(initial);
  const [draft, setDraft] = useState(initial);
  const [reloadKey, setReloadKey] = useState(0);
  const hint = useMemo(() => "需要本机已启动: pnpm flow-editor → :8790", []);
  const title = props?.title || IFRAME_TITLE;

  return (
    <div className="flex h-full w-full flex-col bg-canvas" data-testid="orchestrator-flow-editor-embed">
      <div className="text-sm flex flex-wrap items-center gap-2 border-b border-subtle px-3 py-2">
        <strong>Orchestrator 流程编辑</strong>
        <span className="text-secondary">{hint}</span>
        <input
          aria-label="flow-editor url"
          className="font-mono text-xs min-w-[240px] flex-1 rounded border border-subtle bg-surface-1 px-2 py-1"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <button
          type="button"
          className="rounded border border-subtle px-2 py-1"
          onClick={() => {
            setSrc(draft);
            try {
              window.localStorage.setItem("flow-desk.flowEditorUrl", draft);
            } catch {
              /* ignore */
            }
            setReloadKey((k) => k + 1);
          }}
        >
          加载
        </button>
        <a className="text-accent underline" href={src} target="_blank" rel="noreferrer">
          新窗口打开
        </a>
      </div>
      <iframe
        key={reloadKey}
        title={title}
        src={src}
        className="min-h-0 w-full flex-1 border-0"
        allow="clipboard-read; clipboard-write"
        sandbox="allow-scripts allow-forms allow-downloads allow-popups allow-popups-to-escape-sandbox"
        data-testid="orchestrator-flow-editor-iframe"
      />
    </div>
  );
}

export default OrchestratorFlowEditorEmbed;
