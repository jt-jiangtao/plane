import { useEffect, useState } from "react";
import { Input, CustomSelect } from "@plane/ui";
import { Button } from "@plane/propel/button";

type Parameter = { type?: string; title?: string; default?: unknown; enum?: unknown[] };
export type ProjectRunOption = {
  id: string;
  name: string;
  flows: Array<{
    id: string;
    name: string;
    parameters?: { properties?: Record<string, Parameter>; required?: string[] };
  }>;
};
export function ProjectRunForm({
  projects,
  onStart,
}: {
  projects: ProjectRunOption[];
  onStart: (input: {
    projectId: string;
    flowId: string;
    params: Record<string, unknown>;
  }) => Promise<{ runId: string }>;
}) {
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const project = projects.find((item) => item.id === projectId);
  const [flowId, setFlowId] = useState(projects[0]?.flows[0]?.id ?? "");
  useEffect(() => {
    const selected = projects.find((item) => item.id === projectId) ?? projects[0];
    if (selected?.id !== projectId) setProjectId(selected?.id ?? "");
    if (!selected?.flows.some((item) => item.id === flowId)) setFlowId(selected?.flows[0]?.id ?? "");
  }, [projects, projectId, flowId]);
  const [target, setTarget] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const parameterSchema = project?.flows.find((item) => item.id === flowId)?.parameters;
  const properties: Record<string, Parameter> = parameterSchema?.properties ?? {
    target: { type: "string", title: "检查目标" },
  };
  useEffect(() => {
    setValues({});
    setTarget("");
  }, [projectId, flowId]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [runId, setRunId] = useState("");
  const start = async () => {
    if (loading || !projectId || !flowId) return;
    setLoading(true);
    setError("");
    setRunId("");
    try {
      const params: Record<string, unknown> = {};
      for (const [key, schema] of Object.entries(properties)) {
        const raw = key === "target" ? target : (values[key] ?? "");
        if (!raw.trim()) {
          if (parameterSchema?.required?.includes(key) && schema.default === undefined)
            throw new Error(`请填写 ${schema.title ?? key}`);
          continue;
        }
        const value =
          schema.type === "number" || schema.type === "integer"
            ? Number(raw)
            : schema.type === "boolean" || schema.type === "object" || schema.type === "array"
              ? JSON.parse(raw)
              : raw;
        if (
          (schema.type === "number" || schema.type === "integer") &&
          (!Number.isFinite(value) || (schema.type === "integer" && !Number.isInteger(value)))
        )
          throw new Error(`参数 ${key} 必须是有效数字`);
        if (schema.enum && !schema.enum.includes(value)) throw new Error(`参数 ${key} 不在允许值中`);
        params[key] = value;
      }
      const result = await onStart({ projectId, flowId, params });
      setRunId(result.runId);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "启动失败");
    } finally {
      setLoading(false);
    }
  };
  if (!projects.length)
    return (
      <p role="status" className="px-4 py-3 text-13 text-secondary">
        请先接入项目
      </p>
    );
  return (
    <div className="flex flex-wrap items-end gap-3 border-b border-subtle px-4 py-3">
      <div className="flex flex-col gap-1">
        <span className="text-13 text-secondary">项目</span>
        <CustomSelect
          value={projectId}
          onChange={(value: string) => {
            setProjectId(value);
            setFlowId(projects.find((item) => item.id === value)?.flows[0]?.id ?? "");
          }}
          label={project?.name ?? "选择项目"}
        >
          {projects.map((item) => (
            <CustomSelect.Option key={item.id} value={item.id}>
              {item.name}
            </CustomSelect.Option>
          ))}
        </CustomSelect>
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-13 text-secondary">流程</span>
        <CustomSelect
          value={flowId}
          onChange={(value: string) => setFlowId(value)}
          label={project?.flows.find((item) => item.id === flowId)?.name ?? "选择流程"}
        >
          {(project?.flows ?? []).map((item) => (
            <CustomSelect.Option key={item.id} value={item.id}>
              {item.name}
            </CustomSelect.Option>
          ))}
        </CustomSelect>
      </div>
      {properties.target && (
        <label className="flex min-w-48 flex-1 flex-col gap-1 text-13 text-secondary">
          检查目标
          <Input
            aria-label="检查目标"
            value={target}
            onChange={(event) => setTarget(event.target.value)}
            placeholder="留空使用项目默认范围"
            disabled={loading}
          />
        </label>
      )}
      {Object.entries(properties)
        .filter(([key]) => key !== "target")
        .map(([key, schema]) => (
          <label
            key={key}
            htmlFor={`project-run-${key}`}
            className="flex min-w-48 flex-1 flex-col gap-1 text-13 text-secondary"
          >
            {schema.title ?? key}
            <Input
              id={`project-run-${key}`}
              aria-label={schema.title ?? key}
              value={values[key] ?? ""}
              disabled={loading}
              onChange={(event) => setValues((old) => ({ ...old, [key]: event.target.value }))}
              placeholder={
                schema.default === undefined
                  ? ["array", "object", "boolean"].includes(schema.type ?? "")
                    ? "JSON 值"
                    : ""
                  : String(schema.default)
              }
            />
          </label>
        ))}
      <Button variant="primary" disabled={loading || !flowId} onClick={() => void start()}>
        {loading ? "启动中…" : "开始执行"}
      </Button>
      {error && (
        <p role="alert" className="w-full text-13 text-danger-primary">
          {error}
        </p>
      )}
      {runId && (
        <p role="status" className="w-full text-13 text-secondary">
          任务已启动：{runId}
        </p>
      )}
    </div>
  );
}
