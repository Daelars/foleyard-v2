import { describe, expect, it } from "vitest";

import { MAX_TAG_FILES } from "@foleyard/auto-tag-v2";

import { triggerAutoTagAfterScan } from "./auto-tag-trigger";

// Area: post-scan trigger (#194). The whole decision table through
// injected doubles: disabled or unapproved submits nothing, empty
// arrivals submit nothing, arrivals chunk into stable idempotent jobs.
describe("triggerAutoTagAfterScan", () => {
  function deps(overrides: Record<string, unknown> = {}) {
    const submitted: Array<{ fileIds: string[]; key: string }> = [];
    return {
      submitted,
      isEnabled: () => true,
      granted: () => ["library:read", "tags:write"],
      arrivalsSince: () => [],
      submit: async (fileIds: string[], key: string) => {
        submitted.push({ fileIds, key });
      },
      ...overrides,
    };
  }

  it("submits nothing when the tool is disabled", async () => {
    const world = deps({ isEnabled: () => false, arrivalsSince: () => ["a"] });
    expect(await triggerAutoTagAfterScan("2026-09-07T00:00:00.000Z", world)).toEqual({
      submitted: 0,
      files: 0,
    });
    expect(world.submitted).toEqual([]);
  });

  it("submits nothing when tag writes are not approved", async () => {
    const world = deps({ granted: () => ["library:read"], arrivalsSince: () => ["a"] });
    expect(await triggerAutoTagAfterScan("2026-09-07T00:00:00.000Z", world)).toEqual({
      submitted: 0,
      files: 0,
    });
    expect(world.submitted).toEqual([]);
  });

  it("submits nothing with no arrivals", async () => {
    const world = deps();
    expect(await triggerAutoTagAfterScan("2026-09-07T00:00:00.000Z", world)).toEqual({
      submitted: 0,
      files: 0,
    });
    expect(world.submitted).toEqual([]);
  });

  it("chunks arrivals into stable idempotent jobs", async () => {
    const arrivals = Array.from({ length: MAX_TAG_FILES + 2 }, (_, index) => `f${index}`);
    const world = deps({ arrivalsSince: () => arrivals });
    const startedAt = "2026-09-07T00:00:00.000Z";
    expect(await triggerAutoTagAfterScan(startedAt, world)).toEqual({
      submitted: 2,
      files: arrivals.length,
    });
    expect(world.submitted).toEqual([
      { fileIds: arrivals.slice(0, MAX_TAG_FILES), key: `auto-tag-scan-${startedAt}-0` },
      { fileIds: arrivals.slice(MAX_TAG_FILES), key: `auto-tag-scan-${startedAt}-1` },
    ]);
  });

  it("lets submit failures surface so the caller can log them", async () => {
    const world = deps({
      arrivalsSince: () => ["a"],
      submit: async () => {
        throw new Error("host down");
      },
    });
    await expect(triggerAutoTagAfterScan("2026-09-07T00:00:00.000Z", world)).rejects.toThrow(
      "host down",
    );
  });

  it("submits one job for a partial chunk", async () => {
    const world = deps({ arrivalsSince: () => ["a", "b"] });
    const startedAt = "2026-09-07T00:00:00.000Z";
    expect(await triggerAutoTagAfterScan(startedAt, world)).toEqual({ submitted: 1, files: 2 });
    expect(world.submitted).toEqual([{ fileIds: ["a", "b"], key: `auto-tag-scan-${startedAt}-0` }]);
  });
});
