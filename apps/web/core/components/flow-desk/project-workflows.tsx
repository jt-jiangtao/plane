import { useCallback, useEffect, useState } from "react";
import { Button } from "@plane/propel/button";
import { Input, CustomSelect } from "@plane/ui";
import { ProjectRunForm, type ProjectRunOption } from "./project-run-form";
type Data = Record<string, any>;
export type ProjectWorkflowApi = (operation: string, input?: Data) => Promise<Data>;
export const projectWorkflowApi: ProjectWorkflowApi = async (operation, input = {}) => {
  const csrf = await fetch("/auth/get-csrf-token/");
  if (!csrf.ok) throw new Error("无法读取会话");
  const token = await csrf.json();
  const response = await fetch("/api/flow-desk/desktop/project-workflows/", {
    method: "POST",
    headers: { "content-type": "application/json", "x-csrftoken": token.csrf_token },
    body: JSON.stringify({ operation, input }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "项目流程请求失败");
  return result;
};
async function inspectRunTree(
  api: ProjectWorkflowApi,
  runId: string,
  seen = new Set<string>(),
  depth = 0
): Promise<Data> {
  if (depth > 16 || seen.has(runId)) throw new Error("子流程层级或归属异常");
  seen.add(runId);
  const root = await api("inspect", { runId });
  const own = (root.nodes ?? []).filter(Boolean).map((node: Data) => ({ ...node, sourceRunId: runId }));
  const ids = [
    ...new Set<string>(
      own.flatMap((node: Data) =>
        (node.children ?? [])
          .filter((child: Data) => child.executionId && child.status !== "canceled")
          .map((child: Data) => String(child.executionId))
      )
    ),
  ];
  const children = await Promise.all(ids.map((id) => inspectRunTree(api, id, seen, depth + 1)));
  return { ...root, nodes: [...own, ...children.flatMap((child) => child.nodes)] };
}
const statuses: Record<string, string> = {
  queued: "排队中",
  running: "运行中",
  "waiting-approval": "等待审批",
  passed: "已完成",
  failed: "执行失败",
  blocked: "已阻塞",
  canceled: "已取消",
  "timed-out": "执行超时",
  exceeded: "已达运行上限",
};
function ArtifactPreview({ artifact, runId, api }: { artifact: Data; runId: string; api: ProjectWorkflowApi }) {
  const [value, setValue] = useState<Data>();
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void api("artifact", { runId, artifactId: artifact.id })
      .then((result) => {
        if (active) setValue(result);
      })
      .catch((failure) => {
        if (active) setError(String(failure));
      });
    return () => {
      active = false;
    };
  }, [api, artifact.id, runId]);
  if (error) return <p role="alert">{error}</p>;
  if (!value) return <p role="status">读取证据中…</p>;
  return value.mimeType.startsWith("image/") ? (
    <img
      className="max-h-80 max-w-full rounded border border-subtle object-contain"
      src={`data:${value.mimeType};base64,${value.base64}`}
      alt={artifact.name ?? "页面证据"}
    />
  ) : (
    <pre className="max-h-80 overflow-auto text-12 whitespace-pre-wrap">{value.text}</pre>
  );
}
export function ProjectWorkflows({ api = projectWorkflowApi }: { api?: ProjectWorkflowApi }) {
  const [projects, setProjects] = useState<
      Array<
        ProjectRunOption & {
          configHash?: string;
          candidateHash?: string;
          migration?: { hash: string; status: string; canRollback: boolean };
        }
      >
    >([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [runId, setRunId] = useState(""),
    [run, setRun] = useState<Data>(),
    [busy, setBusy] = useState(false),
    [selected, setSelected] = useState<Record<string, string[]>>({}),
    [candidate, setCandidate] = useState<Data>(),
    [repo, setRepo] = useState(""),
    [projectId, setProjectId] = useState(""),
    [jobId, setJobId] = useState(""),
    [onboarding, setOnboarding] = useState<Data>(),
    [legacyAreas, setLegacyAreas] = useState<Array<{ id: string; name: string }>>([]),
    [migrationArea, setMigrationArea] = useState(""),
    [migrationJobId, setMigrationJobId] = useState(""),
    [migrationStatus, setMigrationStatus] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await api("list");
      setProjects(result.projects ?? []);
      setLegacyAreas(result.legacyAreas ?? []);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [api]);
  const refresh = useCallback(async () => {
    if (runId) setRun(await inspectRunTree(api, runId));
  }, [api, runId]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (!runId) return;
    let alive = true,
      timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const state = await inspectRunTree(api, runId);
        if (!alive) return;
        setRun(state);
        setError("");
        if (["running", "queued"].includes(state.status)) timer = setTimeout(() => void poll(), 2000);
      } catch (failure) {
        if (alive) {
          setError(failure instanceof Error ? failure.message : "读取执行失败");
          timer = setTimeout(() => void poll(), 2000);
        }
      }
    };
    void poll();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [api, runId]);
  useEffect(() => {
    if (!jobId) return;
    let alive = true,
      timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const value = await api("onboarding", { jobId });
        if (!alive) return;
        setOnboarding(value);
        if (value.status === "candidate-ready") {
          await load();
          setCandidate(await api("candidate", { projectId }));
        } else if (value.status === "running") timer = setTimeout(() => void poll(), 2000);
        else setError(value.error ?? value.result?.error ?? "项目准备失败");
      } catch (failure) {
        if (alive) setError(String(failure));
      }
    };
    void poll();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [api, jobId, projectId, load]);
  useEffect(() => {
    if (!migrationJobId) return;
    let alive = true,
      timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const state = await api("migration-preparing", { jobId: migrationJobId });
        if (!alive) return;
        setMigrationStatus(state.status);
        if (state.status === "candidate-ready") {
          await load();
          if (alive) setCandidate(await api("candidate", { projectId: state.projectId }));
        } else if (state.status === "running") timer = setTimeout(() => void poll(), 2000);
        else if (state.status !== "canceled") setError(state.error ?? "迁移准备失败");
      } catch (failure) {
        if (alive) {
          setMigrationStatus("failed");
          setError(String(failure));
        }
      }
    };
    void poll();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [api, migrationJobId, load]);
  const prepareMigration = async () => {
    const areaId = migrationArea || legacyAreas[0]?.id;
    if (!areaId || busy) return;
    setBusy(true);
    setError("");
    setMigrationStatus("running");
    try {
      const result = await api("migration-prepare", {
        areaId,
        projectId: areaId
          .toLowerCase()
          .replace(/[^a-z0-9-]/g, "-")
          .slice(0, 64),
      });
      setMigrationJobId(result.jobId);
    } catch (failure) {
      setMigrationStatus("failed");
      setError(String(failure));
    } finally {
      setBusy(false);
    }
  };
  const onboard = async () => {
    if (busy || !repo.trim() || !projectId) return;
    setBusy(true);
    setError("");
    try {
      const result = await api("onboard", { projectId, repo: repo.trim() });
      setJobId(result.jobId);
      setOnboarding({ status: "running" });
    } catch (failure) {
      setError(String(failure));
    } finally {
      setBusy(false);
    }
  };
  const act = async (operation: string, input: Data) => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await api(operation, input);
      if (operation === "migration-trials") {
        if (result.trials?.[0]?.runId) {
          setRun(undefined);
          setRunId(result.trials[0].runId);
        }
        setCandidate(await api("candidate", { projectId: input.projectId }));
      }
      if (operation !== "migration-trials") await refresh();
      if (operation === "activate" || operation === "migration-activate" || operation === "migration-rollback") {
        setCandidate(undefined);
        await load();
      }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "操作失败");
    } finally {
      setBusy(false);
    }
  };
  const approvals = (run?.nodes ?? []).filter((node: Data) => node?.status === "waiting-approval");
  return (
    <section className="border-b border-subtle text-13">
      <div className="flex flex-wrap items-end gap-3 border-b border-subtle px-4 py-3">
        <label className="flex min-w-64 flex-1 flex-col gap-1 text-secondary">
          仓库路径
          <Input
            aria-label="仓库路径"
            value={repo}
            onChange={(event) => {
              setRepo(event.target.value);
              setProjectId(
                event.target.value
                  .replace(/\/$/, "")
                  .split("/")
                  .pop()
                  ?.toLowerCase()
                  .replace(/[^a-z0-9-]/g, "-")
                  .slice(0, 64) ?? ""
              );
            }}
            placeholder="本机 Git 仓库绝对路径"
          />
        </label>
        <Button variant="secondary" disabled={busy || !repo.trim()} onClick={() => void onboard()}>
          接入并试运行
        </Button>
      </div>
      {legacyAreas.length > 0 && (
        <div className="flex flex-wrap items-end gap-3 border-b border-subtle px-4 py-3">
          <CustomSelect
            value={migrationArea || legacyAreas[0].id}
            onChange={(value: string) => setMigrationArea(value)}
            label={legacyAreas.find((area) => area.id === migrationArea)?.name ?? legacyAreas[0].name}
          >
            {legacyAreas.map((area) => (
              <CustomSelect.Option key={area.id} value={area.id}>
                {area.name}
              </CustomSelect.Option>
            ))}
          </CustomSelect>
          <Button
            variant="secondary"
            disabled={busy || ["running", "cancel-requested"].includes(migrationStatus)}
            onClick={() => void prepareMigration()}
          >
            准备旧项目迁移
          </Button>
        </div>
      )}
      {migrationStatus && (
        <div className="flex items-center gap-3 px-4 py-3">
          <p role="status">
            迁移准备：
            {statuses[migrationStatus] ?? (migrationStatus === "candidate-ready" ? "候选待审批" : migrationStatus)}
          </p>
          {migrationStatus === "running" && migrationJobId && (
            <Button
              variant="secondary"
              onClick={() =>
                void api("migration-cancel", { jobId: migrationJobId })
                  .then(() => setMigrationStatus("cancel-requested"))
                  .catch((failure) => setError(String(failure)))
              }
            >
              取消迁移准备
            </Button>
          )}
        </div>
      )}
      {onboarding?.status === "running" && (
        <p role="status" className="px-4 py-3 text-secondary">
          正在识别、准备并检查项目…
        </p>
      )}

      {loading ? (
        <p role="status" className="px-4 py-3 text-secondary">
          加载项目流程中…
        </p>
      ) : (
        <ProjectRunForm
          projects={projects.filter((project) => project.configHash)}
          onStart={async (input) => {
            const result = await api("start", input);
            setRunId(result.runId);
            setSelected({});
            return { runId: result.runId };
          }}
        />
      )}
      {error && (
        <div className="flex items-center gap-3 px-4 py-3">
          <p role="alert" className="text-danger-primary">
            {error}
          </p>
          <Button variant="secondary" onClick={() => void load()}>
            重试
          </Button>
        </div>
      )}
      {projects
        .filter((project) => project.candidateHash && project.candidateHash !== project.configHash)
        .map((project) => (
          <div key={project.id} className="flex items-center gap-3 px-4 py-2">
            <span>{project.name} 有待审批配置</span>
            <Button
              variant="secondary"
              onClick={() =>
                void api("candidate", { projectId: project.id })
                  .then(setCandidate)
                  .catch((failure) => setError(String(failure)))
              }
            >
              审阅项目配置
            </Button>
          </div>
        ))}
      {projects
        .filter((project) => project.migration?.status === "active")
        .map((project) => (
          <div key={`migration-${project.id}`} className="flex flex-wrap items-center gap-3 px-4 py-2">
            <span>迁移版本：{project.migration!.hash}</span>
            <Button
              variant="secondary"
              disabled={busy || !project.migration!.canRollback}
              onClick={() =>
                void act("migration-rollback", { projectId: project.id, contentHash: project.migration!.hash })
              }
            >
              批准回退项目迁移
            </Button>
          </div>
        ))}
      {candidate && (
        <div className="space-y-3 px-4 py-3">
          <pre className="max-h-96 overflow-auto whitespace-pre-wrap">{JSON.stringify(candidate.config, null, 2)}</pre>
          <p>配置版本：{candidate.contentHash}</p>
          {candidate.migration && (
            <div className="space-y-2">
              <p>旧配置来源：{candidate.migration.sourceHash}</p>
              <pre className="max-h-64 overflow-auto text-12 whitespace-pre-wrap">
                {JSON.stringify(
                  {
                    source: candidate.migration.source,
                    files: candidate.migration.files,
                    mapping: candidate.migration.mapping,
                    trials: candidate.migration.trials,
                  },
                  null,
                  2
                )}
              </pre>
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() =>
                  void act("migration-trials", {
                    projectId: candidate.projectId,
                    contentHash: candidate.migration.contentHash,
                  })
                }
              >
                批准迁移试运行
              </Button>
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() =>
                  void api("candidate", { projectId: candidate.projectId })
                    .then(setCandidate)
                    .catch((failure) => setError(String(failure)))
                }
              >
                刷新迁移验证结果
              </Button>
              {(candidate.migration.trials ?? []).map((trial: Data) => (
                <div key={trial.runId} className="flex items-center gap-3">
                  <span>
                    {trial.flowId ?? trial.runId} · {statuses[trial.status] ?? trial.status}
                  </span>
                  <Button
                    variant="secondary"
                    disabled={busy}
                    onClick={() => {
                      setSelected({});
                      setRun(undefined);
                      setRunId(trial.runId);
                    }}
                  >
                    审阅此试运行
                  </Button>
                </div>
              ))}
            </div>
          )}
          {candidate.onboarding && (
            <div className="space-y-2">
              <p>
                准备与页面检查：已通过；基准测试：
                {statuses[candidate.onboarding.baselineTests?.status] ?? candidate.onboarding.baselineTests?.status}
              </p>
              <pre className="max-h-64 overflow-auto whitespace-pre-wrap">
                {JSON.stringify(candidate.onboarding.plan, null, 2)}
              </pre>
              {(candidate.onboarding.trial?.browserObservation?.pages ?? [])
                .flatMap((page: Data) => page.evidence)
                .map((artifact: Data) => (
                  <ArtifactPreview key={artifact.id} artifact={artifact} runId={candidate.onboarding.jobId} api={api} />
                ))}
            </div>
          )}
          <Button
            disabled={busy || (candidate.migration && !candidate.migration.ready)}
            onClick={() =>
              void act(candidate.migration ? "migration-activate" : "activate", {
                projectId: candidate.projectId,
                contentHash: candidate.migration?.contentHash ?? candidate.contentHash,
              })
            }
          >
            批准并激活此配置
          </Button>
        </div>
      )}
      {runId && !run && (
        <p role="status" className="px-4 py-3 text-secondary">
          读取运行状态中…
        </p>
      )}
      {run && (
        <div className="space-y-3 px-4 py-3">
          <p role="status">{statuses[run.status] ?? run.status}</p>
          <ol className="space-y-1">
            {(run.nodes ?? []).filter(Boolean).map((node: Data) => (
              <li key={`${node.sourceRunId}:${node.nodeId}`}>
                {node.name ?? node.nodeId} · {statuses[node.status] ?? node.status}
                {node.error && <span className="ml-2 text-danger-primary">{node.error}</span>}
                {node.children?.map((child: Data) => (
                  <p key={child.childId} className="pl-4 text-secondary">
                    子任务 {child.executionId ?? child.childId} · {statuses[child.status] ?? child.status}
                  </p>
                ))}
              </li>
            ))}
          </ol>
          {run.cleanup?.status === "failed" && (
            <p role="alert" className="text-danger-primary">
              资源清理失败：{run.cleanup.error}
            </p>
          )}
          {approvals.map((node: Data) => {
            const subject = node.result.subject,
              context = subject?.context ?? {},
              p = subject?.parameters ?? {},
              source = context.results?.[p.subjectRef],
              items = Array.isArray(source) ? source : (source?.items ?? []),
              selectionKey = `${node.sourceRunId}:${node.nodeId}:${node.result.digest}`,
              selectedIds = selected[selectionKey] ?? [];
            const images = context.browserObservation?.pages?.flatMap((page: Data) => page.evidence) ?? [];
            const diffs = Object.values(context.results ?? {})
              .map((value: any) => value.diffArtifact)
              .filter(Boolean);
            return (
              <div key={`${node.sourceRunId}:${node.nodeId}`} className="space-y-3 border-t border-subtle pt-3">
                {node.sourceRunId !== runId && <p className="text-secondary">子流程 {node.sourceRunId}</p>}
                <p>等待审批：{node.name ?? node.nodeId}</p>
                <pre className="max-h-64 overflow-auto whitespace-pre-wrap">
                  {JSON.stringify(
                    {
                      candidateSha: context.candidateSha,
                      targetSha: context.targetSha,
                      diffHash: context.diffHash,
                      evidenceHash: context.evidenceHash,
                      summary: context.results,
                    },
                    null,
                    2
                  )}
                </pre>
                {[...images, ...diffs].map((artifact: Data) => (
                  <ArtifactPreview key={artifact.id} artifact={artifact} api={api} runId={node.sourceRunId ?? runId} />
                ))}
                {p.batch &&
                  items.map((item: Data) => (
                    <label key={item.id} className="flex gap-2">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(item.id)}
                        onChange={(event) =>
                          setSelected((current) => ({
                            ...current,
                            [selectionKey]: event.target.checked
                              ? [...(current[selectionKey] ?? []), item.id]
                              : (current[selectionKey] ?? []).filter((id) => id !== item.id),
                          }))
                        }
                      />
                      {item.title}
                    </label>
                  ))}
                <div className="flex gap-2">
                  <Button
                    disabled={busy}
                    onClick={() =>
                      void act("decision", {
                        runId: node.sourceRunId ?? runId,
                        nodeId: node.nodeId,
                        digest: node.result.digest,
                        decision: "approve",
                        ...(p.batch ? { selectedIds } : {}),
                      })
                    }
                  >
                    批准此版本
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={busy}
                    onClick={() =>
                      void act("decision", {
                        runId: node.sourceRunId ?? runId,
                        nodeId: node.nodeId,
                        digest: node.result.digest,
                        decision: "reject",
                      })
                    }
                  >
                    退回
                  </Button>
                </div>
              </div>
            );
          })}
          {run.status === "running" && (
            <Button variant="secondary" disabled={busy} onClick={() => void act("cancel", { runId })}>
              取消运行
            </Button>
          )}
        </div>
      )}
    </section>
  );
}
