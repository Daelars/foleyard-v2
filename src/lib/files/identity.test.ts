import { describe, expect, it } from "vitest";

import { isSameFileIdentity } from "@/lib/files/identity";

// The Library's single file-identity signal (#269, #274). Every caller —
// permanent deletion and move reconciliation — must agree on it, so the
// null and equality rules are pinned here rather than in each caller.

describe("file identity", () => {
  it("matches when size and mtime are both known and equal", () => {
    expect(
      isSameFileIdentity({ fileSize: 2048, mtimeMs: 1_700_000_000_000 }, { fileSize: 2048, mtimeMs: 1_700_000_000_000 }),
    ).toBe(true);
  });

  it("does not match when size differs", () => {
    expect(
      isSameFileIdentity({ fileSize: 2048, mtimeMs: 1 }, { fileSize: 2049, mtimeMs: 1 }),
    ).toBe(false);
  });

  it("does not match when mtime differs", () => {
    expect(
      isSameFileIdentity({ fileSize: 2048, mtimeMs: 1 }, { fileSize: 2048, mtimeMs: 2 }),
    ).toBe(false);
  });

  it("fails closed when either side's size or mtime is unknown", () => {
    const unknown = { fileSize: null, mtimeMs: null };
    expect(isSameFileIdentity(unknown, unknown)).toBe(false);
    expect(isSameFileIdentity({ fileSize: 2048, mtimeMs: null }, { fileSize: 2048, mtimeMs: null })).toBe(false);
    expect(isSameFileIdentity({ fileSize: null, mtimeMs: 1 }, { fileSize: null, mtimeMs: 1 })).toBe(false);
    expect(isSameFileIdentity({ fileSize: 2048, mtimeMs: 1 }, unknown)).toBe(false);
  });
});
