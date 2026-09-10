import { describe, expect, it } from "vitest";

import { MAX_TAG_FILES } from "@foleyard/auto-tag-v2";

import { triggerAutoTagAfterScan, type ScanCompletion } from "./auto-tag-trigger";

// Area: post-scan trigger (#194, #234). The whole decision table through
// injected doubles: disabled or unapproved submits nothing, an unchanged
// scan submits nothing, and the arrivals the scan reports chunk into
// stable idempotent jobs.
describe("triggerAutoTagAfterScan", () => {
  const at = "2026-09-07T00:00:00.000Z";

  function deps(overrides: Record<string, unknown> = {}) {
    const submitted: Array<{ fileIds: string[]; key: string }> = [];
    return {
      submitted,
      isEnabled: () => true,
      granted: () => ["library:read", "tags:write"],
      submit: async (fileIds: string[], key: string) => {
        submitted.push({ fileIds, key });
      },
      ...overrides,
    };
  }

  function scan(fileIds: string[]): ScanCompletion {
    return { startedAt: at, fileIds };
  }

  it("submits nothing when the tool is disabled", async () => {
    const world = deps({ isEnabled: () => false });
    expect(await triggerAutoTagAfterScan(scan(["a"]), world)).toEqual({
      submitted: 0,
      files: 0,
    });
    expect(world.submitted).toEqual([]);
  });

  it("submits nothing when tag writes are not approved", async () => {
    const world = deps({ granted: () => ["library:read"] });
    expect(await triggerAutoTagAfterScan(scan(["a"]), world)).toEqual({
      submitted: 0,
      files: 0,
    });
    expect(world.submitted).toEqual([]);
  });

  it("submits nothing when the scan changed nothing", async () => {
    const world = deps();
    expect(await triggerAutoTagAfterScan(scan([]), world)).toEqual({
      submitted: 0,
      files: 0,
    });
    expect(world.submitted).toEqual([]);
  });

  it("chunks arrivals into stable idempotent jobs", async () => {
    const arrivals = Array.from({ length: MAX_TAG_FILES + 2 }, (_, index) => `f${index}`);
    const world = deps();
    expect(await triggerAutoTagAfterScan(scan(arrivals), world)).toEqual({
      submitted: 2,
      files: arrivals.length,
    });
    expect(world.submitted).toEqual([
      { fileIds: arrivals.slice(0, MAX_TAG_FILES), key: `auto-tag-scan-${at}-0` },
      { fileIds: arrivals.slice(MAX_TAG_FILES), key: `auto-tag-scan-${at}-1` },
    ]);
  });

  it("submits one job covering a partial arrival set", async () => {
    const world = deps();
    expect(await triggerAutoTagAfterScan(scan(["a", "b"]), world)).toEqual({
      submitted: 1,
      files: 2,
    });
    expect(world.submitted).toEqual([
      { fileIds: ["a", "b"], key: `auto-tag-scan-${at}-0` },
    ]);
  });

  it("gives re-delivered completions the same idempotency keys", async () => {
    const world = deps();
    await triggerAutoTagAfterScan(scan(["a"]), world);
    await triggerAutoTagAfterScan(scan(["a"]), world);
    expect(world.submitted.map((entry) => entry.key)).toEqual([
      `auto-tag-scan-${at}-0`,
      `auto-tag-scan-${at}-0`,
    ]);
  });

  it("lets submit failures surface so the caller can log them", async () => {
    const world = deps({
      submit: async () => {
        throw new Error("host down");
      },
    });
    await expect(triggerAutoTagAfterScan(scan(["a"]), world)).rejects.toThrow("host down");
  });
});
