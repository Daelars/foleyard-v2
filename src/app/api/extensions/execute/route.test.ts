import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const execute = vi.fn();

vi.mock("@/lib/extensions/host", () => ({
  createAppExtensionHost: () => ({ execute }),
}));

import { POST } from "./route";

function request(body: unknown) {
  return new NextRequest("http://localhost/api/extensions/execute", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("POST /api/extensions/execute", () => {
  beforeEach(() => {
    execute.mockReset();
  });

  it("rejects caller-supplied command input", async () => {
    const response = await POST(request({
      extensionId: "library-gatherer",
      commandId: "library-gatherer.gather",
      input: {
        sourceDirectories: ["C:\\private"],
        destinationDirectory: "C:\\elsewhere",
      },
    }));

    expect(response.status).toBe(400);
    expect(execute).not.toHaveBeenCalled();
  });

  it("keeps input-free palette commands working", async () => {
    execute.mockResolvedValue({
      ok: true,
      type: "ui-intent",
      intent: { type: "open-dialog", target: "make-pack" },
    });

    const response = await POST(request({
      extensionId: "make-pack",
      commandId: "make-pack.from-selection",
      selection: { fileIds: ["audio-1"] },
    }));

    expect(response.status).toBe(200);
    expect(execute).toHaveBeenCalledOnce();
  });
});
