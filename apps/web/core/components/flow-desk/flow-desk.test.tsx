/**
 * P6–P28, P32 component coverage (loading/empty/error/ready).
 */
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { FlowView } from "./flow-view";
import { ConfirmPanel } from "./confirm-panel";
import { DispatchDialog } from "./dispatch-dialog";
import { StatusSidebar } from "./status-sidebar";
import { SettingsPage } from "./settings-page";
import { LiveOutput } from "./live-output";

describe("FlowView (P6–P12)", () => {
  it("P6/P7: ready shows nodes with status/attempt and highlights current", () => {
    render(
      <FlowView
        state="ready"
        executionId="e1"
        nodes={[
          { id: "n1", label: "实现", status: "运行中", attempt: 2, assignee: "bot", current: true },
          { id: "n2", label: "确认", status: "等人", attempt: 1 },
        ]}
      />
    );
    expect(screen.getByTestId("flow-node-n1")).toHaveAttribute("data-current", "true");
    expect(screen.getByTestId("flow-node-status-n1")).toHaveTextContent("运行中");
    expect(screen.getByTestId("flow-node-attempt-n1")).toHaveTextContent("#2");
    expect(screen.getByTestId("flow-open-n8n")).toHaveAttribute("href", "flowdesk://execution/e1");
  });

  it("P8: click node invokes handler", () => {
    const onNodeClick = vi.fn();
    render(
      <FlowView
        state="ready"
        nodes={[{ id: "n1", label: "实现", status: "运行中", attempt: 1, childIssueId: "c1" }]}
        onNodeClick={onNodeClick}
      />
    );
    fireEvent.click(screen.getByTestId("flow-node-n1"));
    expect(onNodeClick).toHaveBeenCalledWith(expect.objectContaining({ id: "n1" }));
  });

  it("P10: empty renders nothing (no tab content)", () => {
    const { container } = render(<FlowView state="empty" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("P11: error shows retry", () => {
    const onRetry = vi.fn();
    render(<FlowView state="error" error="boom" onRetry={onRetry} />);
    fireEvent.click(screen.getByText("重试"));
    expect(onRetry).toHaveBeenCalled();
  });

  it("loading state", () => {
    render(<FlowView state="loading" />);
    expect(screen.getByTestId("flow-view-loading")).toBeInTheDocument();
  });
});

describe("ConfirmPanel (P13–P18)", () => {
  it("P13/P14: reject requires reason", async () => {
    const onSubmit = vi.fn();
    render(
      <ConfirmPanel
        visible
        options={[
          { id: "approve", label: "批准" },
          { id: "reject", label: "退回", requiresReason: true },
        ]}
        onSubmit={onSubmit}
      />
    );
    expect(screen.getByTestId("confirm-option-reject")).toBeDisabled();
    fireEvent.change(screen.getByTestId("confirm-reason-reject"), { target: { value: "needs tests" } });
    fireEvent.click(screen.getByTestId("confirm-option-reject"));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith("reject", "needs tests"));
  });

  it("P17: hidden when not waiting", () => {
    const { container } = render(<ConfirmPanel visible={false} options={[]} onSubmit={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("P18: double click submits once", async () => {
    let resolve!: () => void;
    const onSubmit = vi.fn(
      () =>
        new Promise<void>((r) => {
          resolve = r;
        })
    );
    render(
      <ConfirmPanel visible options={[{ id: "approve", label: "批准" }]} onSubmit={onSubmit} />
    );
    fireEvent.click(screen.getByTestId("confirm-option-approve"));
    fireEvent.click(screen.getByTestId("confirm-option-approve"));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    resolve();
  });

  it("P43: shows before/after screenshot diffs on merge/acceptance confirm", () => {
    render(
      <ConfirmPanel
        visible
        options={[{ id: "approve", label: "合入" }]}
        onSubmit={vi.fn()}
        visualChanges={[
          { page: "/", before: "data:image/png;base64,YmVmb3Jl", after: "data:image/png;base64,YWZ0ZXI=" },
        ]}
      />
    );
    expect(screen.getByTestId("confirm-visual-diffs")).toBeTruthy();
    expect(screen.getByTestId("confirm-visual-before-/")).toBeTruthy();
    expect(screen.getByTestId("confirm-visual-after-/")).toBeTruthy();
  });
});

describe("DispatchDialog (P19–P22)", () => {
  it("P21: missing fields marked", async () => {
    render(
      <DispatchDialog open areas={["web"]} flowTypes={["bug-standard"]} onClose={vi.fn()} onSubmit={vi.fn()} />
    );
    fireEvent.click(screen.getByTestId("dispatch-submit"));
    expect(screen.getByTestId("dispatch-missing")).toHaveTextContent("title");
  });

  it("P22: flow type load error blocks submit", () => {
    render(
      <DispatchDialog
        open
        areas={["web"]}
        flowTypes={[]}
        flowTypesError="load failed"
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />
    );
    expect(screen.getByTestId("dispatch-error")).toBeInTheDocument();
    expect(screen.getByTestId("dispatch-flow-type")).toBeDisabled();
  });
});

describe("StatusSidebar (P23–P24)", () => {
  it("P23: shows counts and tasks", () => {
    render(
      <StatusSidebar
        n8nOk
        runnerOk
        configOk
        runningTasks={[{ taskId: "t1", childIssueId: "c1", label: "实现 WEB-1" }]}
      />
    );
    expect(screen.getByTestId("status-running-count")).toHaveTextContent("1");
  });

  it("P24: restart only when window.flowDesk present", () => {
    render(<StatusSidebar n8nOk={false} runnerOk configOk n8nError="down" runningTasks={[]} />);
    expect(screen.queryByTestId("restart-n8n")).toBeNull();
    (window as { flowDesk?: unknown }).flowDesk = {};
    const { unmount } = render(
      <StatusSidebar n8nOk={false} runnerOk configOk n8nError="down" runningTasks={[]} />
    );
    expect(screen.getByTestId("restart-n8n")).toBeInTheDocument();
    unmount();
    delete (window as { flowDesk?: unknown }).flowDesk;
  });
});

describe("SettingsPage (P25–P27, P32)", () => {
  it("P26: non-admin sees nothing", () => {
    const { container } = render(
      <SettingsPage
        isAdmin={false}
        killSwitch={false}
        configText=""
        cursorKeySet={false}
        onToggleKillSwitch={vi.fn()}
        onSaveConfig={vi.fn()}
        onSaveCursorKey={vi.fn()}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("P27/P32: save config error + cursor key set without echo", async () => {
    const onSaveConfig = vi.fn(async () => ({ ok: false as const, position: "areas.web.repo" }));
    const onSaveCursorKey = vi.fn(async () => ({ ok: true as const }));
    render(
      <SettingsPage
        isAdmin
        killSwitch={false}
        configText="areas: {}"
        cursorKeySet={false}
        onToggleKillSwitch={vi.fn()}
        onSaveConfig={onSaveConfig}
        onSaveCursorKey={onSaveCursorKey}
      />
    );
    fireEvent.click(screen.getByTestId("settings-save"));
    await waitFor(() => expect(screen.getByTestId("settings-config-error")).toHaveTextContent("areas.web.repo"));
    fireEvent.change(screen.getByTestId("cursor-key-input"), { target: { value: "sk-secret" } });
    fireEvent.click(screen.getByTestId("cursor-key-save"));
    await waitFor(() => expect(screen.getByTestId("cursor-key-set")).toHaveTextContent("已设置"));
    expect(screen.queryByDisplayValue("sk-secret")).toBeNull();
  });
});

describe("LiveOutput (P28)", () => {
  it("appends chunks while running then collapses", async () => {
    const fetchChunk = vi
      .fn()
      .mockResolvedValueOnce({ text: "a", nextCursor: 1, done: false })
      .mockResolvedValue({ text: "", nextCursor: 1, done: true });
    const { rerender } = render(
      <LiveOutput taskId="t1" running fetchChunk={fetchChunk} pollMs={20} />
    );
    await waitFor(() => expect(screen.getByTestId("live-output-text")).toHaveTextContent("a"));
    rerender(<LiveOutput taskId="t1" running={false} fetchChunk={fetchChunk} pollMs={20} />);
    expect(screen.getByTestId("live-output")).toHaveAttribute("data-collapsed", "true");
  });
});
