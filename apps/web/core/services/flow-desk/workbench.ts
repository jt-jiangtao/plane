export class WorkbenchHistory {
  private entries: string[];
  private cursor = 0;
  private pending: Promise<unknown> = Promise.resolve();
  constructor(
    initial: string,
    private guard: () => Promise<boolean> = async () => true
  ) {
    this.entries = [initial];
  }
  get current() {
    return this.entries[this.cursor];
  }
  get canGoBack() {
    return this.cursor > 0;
  }
  get canGoForward() {
    return this.cursor < this.entries.length - 1;
  }
  private enqueue(action: () => Promise<boolean>) {
    const result = this.pending.then(action).catch(() => false);
    this.pending = result;
    return result;
  }
  visit(target: string) {
    return this.enqueue(async () => {
      if (target === this.current) return false;
      if (!(await this.guard())) return false;
      this.entries = [...this.entries.slice(0, this.cursor + 1), target];
      this.cursor++;
      return true;
    });
  }
  back() {
    return this.enqueue(async () => {
      if (!this.canGoBack || !(await this.guard())) return false;
      this.cursor--;
      return true;
    });
  }
  forward() {
    return this.enqueue(async () => {
      if (!this.canGoForward || !(await this.guard())) return false;
      this.cursor++;
      return true;
    });
  }
  observe(target: string, pop = false, replace = false) {
    if (target === this.current) return;
    if (replace) {
      this.entries[this.cursor] = target;
      return;
    }
    const index = pop ? this.entries.lastIndexOf(target) : -1;
    if (index >= 0) this.cursor = index;
    else {
      this.entries = [...this.entries.slice(0, this.cursor + 1), target];
      this.cursor++;
    }
  }
}

export function validEditorMessage(
  event: { origin: string; source: unknown; data: unknown },
  sender: unknown,
  origin: string
) {
  if (event.origin !== origin || event.source !== sender || !event.data || typeof event.data !== "object") return false;
  const data = event.data as Record<string, unknown>;
  return (
    data.channel === "flow-desk" &&
    data.version === 1 &&
    ["ready", "navigate", "dirty-state", "save-result", "session-expired", "session-failed", "history"].includes(
      String(data.type)
    )
  );
}

export type DesktopApi = {
  platform: string;
  getWorkbenchConfig: () => Promise<{ n8nOrigin: string; fullscreen: boolean }>;
  recoverSession: () => Promise<{ ok: boolean }>;
  onNavigate: (callback: (target: string) => void) => () => void;
  onWindowState: (callback: (state: { fullscreen: boolean }) => void) => () => void;
};
export function desktopApi(): DesktopApi | undefined {
  return typeof window === "undefined" ? undefined : (window as Window & { flowDesk?: DesktopApi }).flowDesk;
}

export function desktopPathAllowed(path: string) {
  return !/(?:^\/(?:sign-up|create-workspace|accounts|invitations|workspace-invitations)(?:\/|$)|\/settings\/(?:projects\/[^/]+\/)?(?:members|teams|billing|profile)(?:\/|$))/.test(
    path
  );
}
