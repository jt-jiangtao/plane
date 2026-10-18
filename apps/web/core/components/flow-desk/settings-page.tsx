import React, { useState } from "react";

export type SettingsPageProps = {
  isAdmin: boolean;
  killSwitch: boolean;
  configText: string;
  cursorKeySet: boolean;
  onToggleKillSwitch: (on: boolean) => Promise<void>;
  onSaveConfig: (text: string) => Promise<{ ok: boolean; position?: string }>;
  onSaveCursorKey: (key: string) => Promise<{ ok: boolean; error?: string }>;
};

export function SettingsPage(props: SettingsPageProps) {
  const [kill, setKill] = useState(props.killSwitch);
  const [config, setConfig] = useState(props.configText);
  const [configError, setConfigError] = useState<string | null>(null);
  const [cursorKey, setCursorKey] = useState("");
  const [cursorSet, setCursorSet] = useState(props.cursorKeySet);

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
    </div>
  );
}
