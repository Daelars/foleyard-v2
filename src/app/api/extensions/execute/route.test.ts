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

  it("forwards caller-supplied command input to the host", async () => {
    execute.mockResolvedValue({
      ok: true,
      type: "value",
      value: { added: 1, removed: 0, remaining: 1 },
    });

    const response = await POST(
      request({
        extensionId: "sound-shelf",
        commandId: "sound-shelf.clear",
        input: { dryRun: true },
      }),
    );

    expect(response.status).toBe(200);
    expect(execute).toHaveBeenCalledOnce();
    expect(execute.mock.calls[0][0]).toEqual({
      extensionId: "sound-shelf",
      commandId: "sound-shelf.clear",
      selection: undefined,
      input: { dryRun: true },
    });
    await expect(response.json()).resolves.toEqual({
      ok: true,
      type: "value",
      value: { added: 1, removed: 0, remaining: 1 },
    });
  });

  it("maps command validation failures to a 400 outcome", async () => {
    execute.mockResolvedValue({
      ok: false,
      reason: "validation-failed",
      message: "name and filter are required",
    });

    const response = await POST(
      request({
        extensionId: "smart-collections",
        commandId: "smart-collections.save-search",
        input: { name: "   " },
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "name and query are required",
    });
  });

  it("requires extensionId and commandId", async () => {
    const response = await POST(request({ extensionId: "sound-shelf" }));

    expect(response.status).toBe(400);
    expect(execute).not.toHaveBeenCalled();
  });

  it("keeps input-free palette commands working", async () => {
    execute.mockResolvedValue({
      ok: true,
      type: "ui-intent",
      intent: { type: "open-dialog", target: "make-pack" },
    });

    const response = await POST(
      request({
        extensionId: "make-pack",
        commandId: "make-pack.from-selection",
        selection: { fileIds: ["audio-1"] },
      }),
    );

    expect(response.status).toBe(200);
    expect(execute).toHaveBeenCalledOnce();
  });
});
