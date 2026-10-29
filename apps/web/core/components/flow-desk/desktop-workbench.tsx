import React, { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router";
import { desktopApi, desktopPathAllowed } from "@/services/flow-desk/workbench";
import { OrchestratorFlowEditorEmbed } from "./orchestrator-flow-editor-embed";
import { usePublishDesktopHistory } from "./desktop-history";

/**
 * Minimal desktop workbench (Scheme B).
 * Primary: orchestrator Flow Editor embed.
 * n8n: compatibility-only panel (not orchestration truth).
 * Full legacy n8n iframe/catalog/workflows WIP archived as
 * docs/rewrite-evidence/plane-g1b/desktop-workbench.full-wip.tsx.patch-source
 */
export function DesktopWorkbench({ children }: { children: React.ReactNode }) {
  const api = desktopApi();
  const location = useLocation();
  const navigate = useNavigate();
  const { workspaceSlug = "flow-desk" } = useParams();
  const query = new URLSearchParams(location.search);
  const isWorkbench = location.pathname.replace(/\/$/, "") === `/${workspaceSlug}/desktop`;
  const view = query.get("view") || "issues";

  const [n8nOrigin, setN8nOrigin] = useState("http://127.0.0.1:5678");

  useEffect(() => {
    if (!api) return;
    void api.getWorkbenchConfig().then((cfg) => {
      if (cfg?.n8nOrigin) setN8nOrigin(cfg.n8nOrigin);
      return undefined;
    });
  }, [api]);

  // Lightweight history publish for top-nav buttons (no full WorkbenchHistory yet)
  const historyControls = useMemo(
    () => ({
      canGoBack: window.history.length > 1,
      canGoForward: false,
      back: () => navigate(-1),
      forward: () => navigate(1),
    }),
    [navigate]
  );
  usePublishDesktopHistory(historyControls);

  if (!desktopPathAllowed(location.pathname)) {
    return (
      <div role="status" className="p-10 text-secondary">
        本机模式不提供此功能。
      </div>
    );
  }

  if (isWorkbench && (view === "orchestrator-flows" || view === "flow-editor")) {
    return (
      <div
        className="flex h-full w-full flex-col overflow-hidden bg-canvas"
        data-testid="desktop-workbench-orchestrator"
      >
        <OrchestratorFlowEditorEmbed />
      </div>
    );
  }

  if (isWorkbench && view === "n8n") {
    return (
      <div
        className="flex h-full w-full flex-col gap-4 overflow-auto bg-canvas p-6"
        data-testid="desktop-workbench-n8n-compat"
      >
        <div className="border-amber-300 bg-amber-50 text-sm text-amber-950 rounded-lg border p-4">
          <strong>n8n(旧) 仅为兼容</strong>
          <p className="mt-1">
            编排真相是 Orchestrator + Flow Editor（方案 B）。请使用侧栏「编排」或
            <Link className="mx-1 underline" to={`/${workspaceSlug}/settings/flow-desk/orchestrator-flows`}>
              设置 → 编排流程
            </Link>
            。
          </p>
        </div>
        <iframe
          title="n8n legacy (compat)"
          src={`${n8nOrigin}/home/workflows`}
          className="min-h-[70vh] w-full flex-1 rounded-md border border-subtle"
          sandbox="allow-scripts allow-forms allow-downloads allow-popups allow-popups-to-escape-sandbox"
        />
      </div>
    );
  }

  // Non-desktop routes or other desktop views: pass through Plane children
  return <>{children}</>;
}

export default DesktopWorkbench;
