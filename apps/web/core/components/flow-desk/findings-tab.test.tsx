/**
 * add-findings-review 1.1 — P38–P42
 */
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { FindingsTab, type FindingRow } from "./findings-tab";

const sample: FindingRow[] = [
  {
    fingerprint: "fp1",
    rule: "overflow",
    level: "error",
    status: "new",
    kind: "ui",
    message: "文字溢出",
  },
  {
    fingerprint: "fp2",
    rule: "axe",
    level: "error",
    status: "new",
    kind: "ui",
    message: "axe 关键",
  },
  {
    fingerprint: "fp3",
    rule: "complexity",
    level: "warning",
    status: "existing",
    kind: "code",
    message: "复杂度",
  },
];

describe("FindingsTab (P38–P42)", () => {
  it("P38: lists findings and filters by kind/level/status", () => {
    render(<FindingsTab state="ready" findings={sample} />);
    expect(screen.getByTestId("findings-tab")).toBeTruthy();
    expect(screen.getByTestId("finding-fp1")).toBeTruthy();
    fireEvent.change(screen.getByTestId("filter-kind"), { target: { value: "code" } });
    expect(screen.queryByTestId("finding-fp1")).toBeNull();
    expect(screen.getByTestId("finding-fp3")).toBeTruthy();
  });

  it("P39/P40: actions required; ignore without reason blocks submit", async () => {
    const onSubmitActions = vi.fn();
    render(
      <FindingsTab state="ready" findings={sample.slice(0, 2)} awaitingActions onSubmitActions={onSubmitActions} />
    );
    expect((screen.getByTestId("findings-submit-actions") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByTestId("finding-action-fp1-create"));
    fireEvent.click(screen.getByTestId("finding-action-fp2-ignore"));
    expect((screen.getByTestId("findings-submit-actions") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByTestId("finding-reason-fp2"), { target: { value: "false positive" } });
    fireEvent.click(screen.getByTestId("findings-submit-actions"));
    await waitFor(() => expect(onSubmitActions).toHaveBeenCalled());
    expect(onSubmitActions.mock.calls[0][0]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ fingerprint: "fp1", action: "create" }),
        expect.objectContaining({ fingerprint: "fp2", action: "ignore", reason: "false positive" }),
      ])
    );
  });

  it("P41/P42 states: loading/empty/error", () => {
    const { rerender } = render(<FindingsTab state="loading" />);
    expect(screen.getByTestId("findings-tab-loading")).toBeTruthy();
    rerender(<FindingsTab state="empty" />);
    expect(screen.getByTestId("findings-tab-empty")).toBeTruthy();
    const onRetry = vi.fn();
    rerender(<FindingsTab state="error" error="boom" onRetry={onRetry} />);
    fireEvent.click(screen.getByText("重试"));
    expect(onRetry).toHaveBeenCalled();
  });
});
