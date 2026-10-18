import { describe, expect, it } from "vitest";

import { executionLink, workItemLink } from "./links";

describe("flow-desk links", () => {
  it("P9/N10/N11: builds flowdesk:// links", () => {
    expect(workItemLink("WEB-42")).toBe("flowdesk://work-item/WEB-42");
    expect(executionLink("exec-1")).toBe("flowdesk://execution/exec-1");
  });
});
