import { beforeEach, describe, expect, it, vi } from "vitest";

const execute = vi.fn();

vi.mock("@/lib/extensions/host", () => ({
  createAppExtensionHost: () => ({ execute }),
}));

import { POST } from "./route";

describe("POST /api/extensions/sound-shelf/clear", () => {
  beforeEach(() => {
    execute.mockReset();
  });

  it("keeps the existing successful response body", async () => {
    execute.mockResolvedValue({
      ok: true,
      type: "value",
      value: { added: 0, removed: 2, remaining: 0 },
    });

    const response = await POST();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      added: 0,
      removed: 2,
      remaining: 0,
    });
    expect(execute).toHaveBeenCalledWith({
      extensionId: "sound-shelf",
      commandId: "sound-shelf.clear",
    });
  });

  it("keeps the existing disabled response", async () => {
    execute.mockResolvedValue({
      ok: false,
      reason: "extension-disabled",
      message: 'Extension "sound-shelf" is disabled.',
    });

    const response = await POST();

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Extension is disabled",
    });
  });
});
