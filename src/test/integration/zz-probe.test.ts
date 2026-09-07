import { describe, expect, it } from "vitest";

import type { V2DirectoryEntry } from "@yard-core";

const entries = new Map<string, V2DirectoryEntry[]>([
  ["/lib/empty", []],
  [
    "/lib/full",
    [{ name: "b.mp3", path: "/lib/full/b.mp3", kind: "file" as const, size: 20 }],
  ],
  [
    "/media/inbox",
    [{ name: "found.wav", path: "/media/inbox/found.wav", kind: "file" as const, size: 30 }],
  ],
]);

describe("probe", () => {
  it("counts", () => {
    expect(entries.size).toBe(3);
  });
});
