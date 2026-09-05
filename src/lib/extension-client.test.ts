import { describe, expect, it, vi, afterEach } from "vitest";

import { executeExtensionCommand } from "./extension-client";

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch(body: unknown, ok: boolean) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok, json: async () => body }) as Response),
  );
}

describe("executeExtensionCommand", () => {
  it("posts to the generic execute endpoint and returns the value", async () => {
    stubFetch({ ok: true, type: "value", value: { copied: 2 } }, true);

    const value = await executeExtensionCommand<{ copied: number }>({
      extensionId: "library-gatherer",
      commandId: "library-gatherer.gather",
      input: { sourceDirectories: ["/library/inbox"] },
    });

    expect(value).toEqual({ copied: 2 });
    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe("/api/extensions/execute");
    expect(JSON.parse(init.body)).toMatchObject({
      extensionId: "library-gatherer",
      commandId: "library-gatherer.gather",
    });
  });

  it("throws the host failure message when the outcome is not ok", async () => {
    stubFetch(
      { ok: false, reason: "validation-failed", message: "paths array is required" },
      false,
    );

    await expect(
      executeExtensionCommand({
        extensionId: "folder-janitor",
        commandId: "folder-janitor.delete-folders",
      }),
    ).rejects.toThrow("paths array is required");
  });

  it("throws the transport error message for non-envelope failures", async () => {
    stubFetch({ error: "No library roots configured" }, false);

    await expect(
      executeExtensionCommand({
        extensionId: "folder-janitor",
        commandId: "folder-janitor.scan-library",
        input: {},
      }),
    ).rejects.toThrow("No library roots configured");
  });
});
