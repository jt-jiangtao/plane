import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { UiScanTrigger } from "./ui-scan-trigger";

describe("界面扫描入口", () => {
  it("starts a scan from the Plane button", async () => {
    const onStart = vi.fn(async () => undefined);
    render(<UiScanTrigger state="ready" onStart={onStart} />);
    fireEvent.click(screen.getByRole("button", { name: "界面扫描" }));
    await waitFor(() => expect(onStart).toHaveBeenCalledTimes(1));
  });

  it("shows the failure when the flow service is unavailable", async () => {
    const onStart = vi.fn(async () => {
      throw new Error("无法连接流程服务");
    });
    render(<UiScanTrigger state="error" onStart={onStart} />);
    expect(screen.getByRole("alert")).toHaveTextContent("无法连接流程服务");
    fireEvent.click(screen.getByRole("button", { name: "界面扫描" }));
    expect(onStart).not.toHaveBeenCalled();
  });
});
