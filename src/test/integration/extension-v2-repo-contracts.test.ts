import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { getDocumentationRegistry } from "@/lib/documentation";

// Area: extension v2 R10 (#173). The shipped docs manifest registers the
// v2 guides while the handoff prompt and historical audits stay out.

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

describe("v2 documentation contracts", () => {
  it("registers the four v2 guides and keeps unshipped docs out of the manifest", () => {
    const { documents } = getDocumentationRegistry();
    const ids = documents.map((entry) => entry.id);
    for (const id of [
      "extensions-v2",
      "extensions-v2-migration",
      "extensions-v2-make-pack",
      "extensions-v2-troubleshooting",
    ]) {
      expect(ids).toContain(id);
    }
    for (const entry of documents) {
      expect(existsSync(join(root, entry.relativePath)), `missing ${entry.id}`).toBe(true);
    }
    for (const entry of documents) {
      expect(entry.relativePath.startsWith("docs/plans/")).toBe(false);
      expect(entry.relativePath.startsWith("docs/audits/")).toBe(false);
      expect(entry.relativePath.startsWith("docs/audit-2026-09/")).toBe(false);
    }
    expect(ids).not.toContain("extension-v2-implementation-prompt");
  });
});
