import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ProjectRunForm } from "./project-run-form";
describe("project-scoped run input", () => {
  it("collects declared typed parameters and rejects missing required values before starting", async () => {
    const onStart = vi.fn(async () => ({ runId: "run" }));
    render(
      <ProjectRunForm
        projects={[
          {
            id: "p",
            name: "Project",
            flows: [
              {
                id: "platform-upgrade",
                name: "Upgrade",
                parameters: {
                  properties: { version: { type: "string", title: "Codex 版本" }, repeat: { type: "integer" } },
                  required: ["version"],
                },
              },
            ],
          },
        ]}
        onStart={onStart}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "开始执行" }));
    await screen.findByRole("alert");
    expect(onStart).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Codex 版本"), { target: { value: "1.2.3" } });
    fireEvent.change(screen.getByLabelText("repeat"), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: "开始执行" }));
    await waitFor(() =>
      expect(onStart).toHaveBeenCalledWith({
        projectId: "p",
        flowId: "platform-upgrade",
        params: { version: "1.2.3", repeat: 3 },
      })
    );
  });
  it("sends a selected project and typed target without inventing commands", async () => {
    const onStart = vi.fn(async () => ({ runId: "run" }));
    render(
      <ProjectRunForm
        projects={[{ id: "p", name: "Project", flows: [{ id: "ui-audit", name: "界面扫描" }] }]}
        onStart={onStart}
      />
    );
    fireEvent.change(screen.getByLabelText("检查目标"), { target: { value: "用户管理" } });
    fireEvent.click(screen.getByRole("button", { name: "开始执行" }));
    await waitFor(() =>
      expect(onStart).toHaveBeenCalledWith({ projectId: "p", flowId: "ui-audit", params: { target: "用户管理" } })
    );
  });
  it("shows an empty state and prevents duplicate start while loading", async () => {
    const onStart = vi.fn(async () => new Promise<{ runId: string }>(() => {}));
    const { unmount } = render(<ProjectRunForm projects={[]} onStart={onStart} />);
    expect(screen.getByText("请先接入项目")).toBeInTheDocument();
    unmount();
    render(
      <ProjectRunForm
        projects={[{ id: "p", name: "Project", flows: [{ id: "scan", name: "Scan" }] }]}
        onStart={onStart}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "开始执行" }));
    expect(screen.getByRole("button", { name: "启动中…" })).toBeDisabled();
  });
  it("surfaces start errors without showing completion", async () => {
    render(
      <ProjectRunForm
        projects={[{ id: "p", name: "Project", flows: [{ id: "scan", name: "Scan" }] }]}
        onStart={async () => {
          throw new Error("项目配置尚未审批");
        }}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "开始执行" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("项目配置尚未审批"));
  });
});

it("selects a project arriving after loading and preserves project defaults on a blank target", async () => {
  const onStart = vi.fn(async () => ({ runId: "r" }));
  const { rerender } = render(<ProjectRunForm projects={[]} onStart={onStart} />);
  rerender(
    <ProjectRunForm
      projects={[{ id: "p", name: "Project", flows: [{ id: "scan", name: "Scan" }] }]}
      onStart={onStart}
    />
  );
  await waitFor(() => expect(screen.getByRole("button", { name: "开始执行" })).not.toBeDisabled());
  fireEvent.click(screen.getByRole("button", { name: "开始执行" }));
  await waitFor(() => expect(onStart).toHaveBeenCalledWith({ projectId: "p", flowId: "scan", params: {} }));
});
