/** Thin client for Plane → flow-desk module proxy endpoints. */

export type FlowDeskApiOptions = {
  workspaceSlug: string;
  projectId: string;
  fetchFn?: typeof fetch;
};

export class FlowDeskApi {
  private readonly fetchFn: typeof fetch;

  constructor(private readonly opts: FlowDeskApiOptions) {
    this.fetchFn = opts.fetchFn ?? fetch;
  }

  private url(suffix: string) {
    return `/api/workspaces/${this.opts.workspaceSlug}/projects/${this.opts.projectId}/flow-desk/${suffix}`;
  }

  async submitDecision(body: Record<string, unknown>) {
    const res = await this.fetchFn(this.url("decisions/"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    return { status: res.status, body: await res.json().catch(() => ({})) };
  }

  async getStatus() {
    const res = await this.fetchFn(this.url("status/"));
    return { status: res.status, body: await res.json().catch(() => ({})) };
  }

  async putSettings(raw: string) {
    const res = await this.fetchFn(this.url("settings/"), {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ raw }),
    });
    return { status: res.status, body: await res.json().catch(() => ({})) };
  }

  async putCursorKey(key: string) {
    const res = await this.fetchFn(this.url("credentials/cursor/"), {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key }),
    });
    return { status: res.status, body: await res.json().catch(() => ({})) };
  }
}
