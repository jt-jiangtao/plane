import React, { useState } from "react";

export type AutonomyRow = {
  area: string;
  flowType: string;
  level: number;
  canLevel2: boolean;
  recentPassRate?: number;
  recentEscapes?: number;
};

export type SettingsPageProps = {
  isAdmin: boolean;
  killSwitch: boolean;
  configText: string;
  cursorKeySet: boolean;
  autonomyRows?: AutonomyRow[];
  onToggleKillSwitch: (on: boolean) => Promise<void>;
  onSaveConfig: (text: string) => Promise<{ ok: boolean; position?: string }>;
  onSaveCursorKey: (key: string) => Promise<{ ok: boolean; error?: string }>;
  onSaveAutonomy?: (rows: AutonomyRow[]) => Promise<{ ok: boolean; error?: string }>;
};

export function SettingsPage(props: SettingsPageProps) {
  const [kill, setKill] = useState(props.killSwitch);
  const [config, setConfig] = useState(props.configText);
  const [configError, setConfigError] = useState<string | null>(null);
  const [cursorKey, setCursorKey] = useState("");
  const [cursorSet, setCursorSet] = useState(props.cursorKeySet);
  const [autonomy, setAutonomy] = useState<AutonomyRow[]>(props.autonomyRows ?? []);
  const [autonomyError, setAutonomyError] = useState<string | null>(null);

  if (!props.isAdmin) return null;

  return (
    <div data-testid="flow-desk-settings">
      <label>
        总开关
        <input
          data-testid="kill-switch"
          type="checkbox"
          checked={kill}
          onChange={async (e) => {
            const next = e.target.checked;
            const prev = kill;
            setKill(next);
            try {
              await props.onToggleKillSwitch(next);
            } catch {
              setKill(prev);
            }
          }}
        />
      </label>
      <textarea data-testid="settings-config" value={config} onChange={(e) => setConfig(e.target.value)} />
      <button
        type="button"
        data-testid="settings-save"
        onClick={async () => {
          const r = await props.onSaveConfig(config);
          setConfigError(r.ok ? null : r.position ?? "invalid");
        }}
      >
        保存配置
      </button>
      {configError ? <p data-testid="settings-config-error">{configError}</p> : null}
      <div>
        {cursorSet ? (
          <span data-testid="cursor-key-set">已设置</span>
        ) : (
          <>
            <input
              data-testid="cursor-key-input"
              type="password"
              value={cursorKey}
              onChange={(e) => setCursorKey(e.target.value)}
            />
            <button
              type="button"
              data-testid="cursor-key-save"
              onClick={async () => {
                const r = await props.onSaveCursorKey(cursorKey);
                if (r.ok) {
                  setCursorSet(true);
                  setCursorKey("");
                }
              }}
            >
              保存密钥
            </button>
          </>
        )}
      </div>
      {autonomy.length > 0 ? (
        <div data-testid="settings-autonomy">
          {autonomy.map((row, idx) => (
            <div key={`${row.area}-${row.flowType}`} data-testid={`autonomy-row-${row.area}-${row.flowType}`}>
              <span>
                {row.area}/{row.flowType}
              </span>
              <input
                data-testid={`autonomy-level-${row.area}-${row.flowType}`}
                type="number"
                min={0}
                max={2}
                value={row.level}
                onChange={(e) => {
                  const next = [...autonomy];
                  next[idx] = { ...row, level: Number(e.target.value) };
                  setAutonomy(next);
                }}
              />
              <span data-testid={`autonomy-stats-${row.area}-${row.flowType}`}>
                pass={row.recentPassRate ?? "-"} escapes={row.recentEscapes ?? "-"}
              </span>
            </div>
          ))}
          <button
            type="button"
            data-testid="autonomy-save"
            onClick={async () => {
              const invalid = autonomy.find((r) => r.level === 2 && !r.canLevel2);
              if (invalid) {
                setAutonomyError(`${invalid.flowType} cannot be level 2`);
                return;
              }
              if (props.onSaveAutonomy) {
                const r = await props.onSaveAutonomy(autonomy);
                setAutonomyError(r.ok ? null : r.error ?? "save failed");
              } else {
                setAutonomyError(null);
              }
            }}
          >
            保存放权
          </button>
          {autonomyError ? <p data-testid="autonomy-error">{autonomyError}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
