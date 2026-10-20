import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { ProjectWorkflows } from "./project-workflows";
const projects = [{ id: "p", name: "Project", configHash: "approved", flows: [{ id: "scan", name: "界面巡检" }] }];
describe("project workflow controls", () => {
  it("prepares legacy migration through an Agent and surfaces preparation failure", async () => {
    const api = vi.fn(async (operation: string) =>
      operation === "list"
        ? { projects: [], legacyAreas: [{ id: "old-area", name: "旧项目" }] }
        : operation === "migration-prepare"
          ? { jobId: "migration-job" }
          : { status: "failed", error: "无法保留旧节点语义" }
    );
    render(<ProjectWorkflows api={api} />);
    fireEvent.click(await screen.findByRole("button", { name: "准备旧项目迁移" }));
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith("migration-prepare", { areaId: "old-area", projectId: "old-area" })
    );
    expect(await screen.findByRole("alert")).toHaveTextContent("无法保留旧节点语义");
    expect(screen.queryByRole("button", { name: "批准并激活此配置" })).not.toBeInTheDocument();
  });
  it("keeps migration activation disabled until all actual trials pass", async () => {
    const api = vi.fn(async (operation: string) =>
      operation === "list"
        ? { projects: [{ ...projects[0], candidateHash: "next" }] }
        : {
            projectId: "p",
            contentHash: "next",
            config: {},
            migration: {
              contentHash: "migration",
              ready: false,
              sourceHash: "old",
              trials: [{ runId: "trial", status: "failed" }],
            },
          }
    );
    render(<ProjectWorkflows api={api} />);
    fireEvent.click(await screen.findByRole("button", { name: "审阅项目配置" }));
    expect(await screen.findByRole("button", { name: "批准并激活此配置" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "批准迁移试运行" })).toBeEnabled();
  });
  it("shows empty and failed loading states without presenting a run as completed", async () => {
    const { unmount } = render(<ProjectWorkflows api={async () => ({ projects: [] })} />);
    await waitFor(() => expect(screen.getByText("请先接入项目")).toBeInTheDocument());
    unmount();
    render(
      <ProjectWorkflows
        api={async () => {
          throw new Error("流程服务不可用");
        }}
      />
    );
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("流程服务不可用"));
  });
  it("starts a selected flow and displays the actual pending human approval", async () => {
    const api = vi.fn(async (operation: string) =>
      operation === "list"
        ? { projects }
        : operation === "start"
          ? { runId: "r" }
          : operation === "inspect"
            ? {
                runId: "r",
                status: "running",
                nodes: [
                  {
                    nodeId: "approve",
                    name: "审批扫描发现",
                    status: "waiting-approval",
                    result: {
                      digest: "exact",
                      subject: { context: { candidateSha: "sha", evidenceHash: "report" } },
                    },
                  },
                ],
              }
            : { status: "passed" }
    );
    render(<ProjectWorkflows api={api} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "开始执行" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "开始执行" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "批准此版本" })).toBeInTheDocument());
    expect(screen.getByText("等待审批：审批扫描发现")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "批准此版本" }));
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith(
        "decision",
        expect.objectContaining({
          runId: "r",
          nodeId: "approve",
          digest: "exact",
          decision: "approve",
        })
      )
    );
  });
  for (const [status, label] of [
    ["passed", "已完成"],
    ["failed", "执行失败"],
    ["canceled", "已取消"],
  ] as const)
    it(`shows ${status} as its own terminal state`, async () => {
      const api = async (operation: string) =>
        operation === "list"
          ? { projects }
          : operation === "start"
            ? { runId: "r" }
            : { runId: "r", status, nodes: [] };
      render(<ProjectWorkflows api={api} />);
      await waitFor(() => expect(screen.getByRole("button", { name: "开始执行" })).toBeEnabled());
      fireEvent.click(screen.getByRole("button", { name: "开始执行" }));
      await waitFor(() => expect(screen.getByText(label)).toBeInTheDocument());
    });
});

it("accepts a repository path and starts asynchronous project preparation", async () => {
  const api = vi.fn(async (operation: string) =>
    operation === "list" ? { projects: [] } : operation === "onboard" ? { jobId: "job" } : { status: "running" }
  );
  render(<ProjectWorkflows api={api} />);
  fireEvent.change(screen.getByLabelText("仓库路径"), { target: { value: "/tmp/repository" } });
  fireEvent.click(screen.getByRole("button", { name: "接入并试运行" }));
  await waitFor(() =>
    expect(api).toHaveBeenCalledWith("onboard", {
      projectId: "repository",
      repo: "/tmp/repository",
    })
  );
  await waitFor(() => expect(screen.getByText("正在识别、准备并检查项目…")).toBeInTheDocument());
});
it("surfaces a child approval in the parent view and submits it to the exact child run", async () => {
  const api = vi.fn(async (operation: string, input?: any) =>
    operation === "list"
      ? { projects }
      : operation === "start"
        ? { runId: "root" }
        : operation === "inspect"
          ? input.runId === "root"
            ? {
                runId: "root",
                status: "running",
                nodes: [
                  {
                    nodeId: "repair",
                    name: "执行获批修改",
                    status: "running",
                    children: [{ childId: "child", executionId: "child", status: "running" }],
                  },
                ],
              }
            : {
                runId: "child",
                status: "running",
                nodes: [
                  {
                    nodeId: "approval",
                    name: "审批方案",
                    status: "waiting-approval",
                    result: { digest: "child-digest", subject: { context: {}, parameters: {} } },
                  },
                ],
              }
          : { status: "passed" }
  );
  render(<ProjectWorkflows api={api} />);
  await waitFor(() => expect(screen.getByRole("button", { name: "开始执行" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "开始执行" }));
  await waitFor(() => expect(screen.getByText("等待审批：审批方案")).toBeInTheDocument());
  fireEvent.click(screen.getByRole("button", { name: "批准此版本" }));
  await waitFor(() =>
    expect(api).toHaveBeenCalledWith(
      "decision",
      expect.objectContaining({ runId: "child", nodeId: "approval", digest: "child-digest" })
    )
  );
});
it("keeps batch selections separate for parent and child approvals", async () => {
  const approval = (title: string, id: string) => ({
    nodeId: "review",
    name: title,
    status: "waiting-approval",
    result: {
      digest: id,
      subject: {
        parameters: { batch: true, subjectRef: "findings" },
        context: { results: { findings: { items: [{ id, title }] } } },
      },
    },
  });
  const api = vi.fn(async (operation: string, input?: any) =>
    operation === "list"
      ? { projects }
      : operation === "start"
        ? { runId: "root" }
        : operation === "inspect"
          ? {
              runId: input.runId,
              status: "running",
              nodes:
                input.runId === "root"
                  ? [
                      approval("根发现", "a"),
                      {
                        nodeId: "repair",
                        children: [{ childId: "child", executionId: "child", status: "running" }],
                      },
                    ]
                  : [approval("子发现", "b")],
            }
          : { status: "passed" }
  );
  render(<ProjectWorkflows api={api} />);
  await waitFor(() => expect(screen.getByRole("button", { name: "开始执行" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "开始执行" }));
  await waitFor(() => expect(screen.getByLabelText("子发现")).toBeInTheDocument());
  fireEvent.click(screen.getByLabelText("根发现"));
  fireEvent.click(screen.getByLabelText("子发现"));
  fireEvent.click(screen.getAllByRole("button", { name: "批准此版本" })[0]!);
  await waitFor(() =>
    expect(api).toHaveBeenCalledWith("decision", expect.objectContaining({ runId: "root", selectedIds: ["a"] }))
  );
  await waitFor(() => expect(screen.getAllByRole("button", { name: "批准此版本" })[1]!).toBeEnabled());
  fireEvent.click(screen.getAllByRole("button", { name: "批准此版本" })[1]!);
  await waitFor(() =>
    expect(api).toHaveBeenCalledWith("decision", expect.objectContaining({ runId: "child", selectedIds: ["b"] }))
  );
});
