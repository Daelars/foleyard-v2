import { describe, expect, it } from "vitest";

import {
  buildManifestText,
  commonParentDir,
  dedupeIds,
  defaultPackName,
  detectZipConflicts,
  MAX_PACK_FILES,
  planFolderNames,
  resolvePackOptions,
  sanitizePackName,
} from "./policy";

// Area: extension v2 R8 (#171). Pure export-policy unit tests: name
// planning, collision reservation, manifest shaping, option
// validation. No services, no disk.
describe("make-pack-v2 policy", () => {
  it("falls back to per-source default pack names", () => {
    expect(defaultPackName("selection")).toBe("Selected Sounds Pack");
    expect(defaultPackName("shelf")).toBe("Shelf Pack");
    expect(defaultPackName("recent")).toBe("Recent Sounds Pack");
    expect(sanitizePackName(undefined, "shelf")).toBe("Shelf Pack");
    expect(sanitizePackName("   ", "recent")).toBe("Recent Sounds Pack");
  });

  it("sanitizes OS-invalid characters and bounds the length", () => {
    expect(sanitizePackName("a/b\\c:d*e?f\"g<h>i|j", "selection")).toBe(
      "a-b-c-d-e-f-g-h-i-j",
    );
    expect(sanitizePackName("x".repeat(200), "selection")).toHaveLength(80);
  });

  it("dedupes IDs while preserving order", () => {
    expect(dedupeIds(["b", "a", "b", "c", "a"])).toEqual(["b", "a", "c"]);
  });

  it("dedupes folder names case-insensitively in name-2 style", () => {
    const planned = planFolderNames(
      [
        { fileId: "a", filename: "Hit.wav" },
        { fileId: "b", filename: "hit.wav" },
        { fileId: "c", filename: "hit.wav" },
      ],
      false,
    );
    expect(planned.files.map((file) => file.outputName)).toEqual([
      "Hit.wav",
      "hit 2.wav",
      "hit 3.wav",
    ]);
    expect(planned.files[2]?.renamed).toBe(true);
    expect(planned.notices).toHaveLength(2);
  });

  it("reserves manifest.json case-insensitively for folder output", () => {
    const planned = planFolderNames(
      [{ fileId: "a", filename: "MANIFEST.JSON" }],
      true,
    );
    expect(planned.files[0]?.outputName).toBe("MANIFEST 2.JSON");
    const off = planFolderNames([{ fileId: "a", filename: "manifest.json" }], false);
    expect(off.files[0]?.outputName).toBe("manifest.json");
  });

  it("sanitizes OS-invalid source filenames for folder output", () => {
    const planned = planFolderNames([{ fileId: "a", filename: "a:b?.wav" }], false);
    expect(planned.files[0]?.outputName).toBe("a-b-.wav");
  });

  it("detects ZIP entry collisions and manifest reservation conflicts", () => {
    expect(detectZipConflicts(["a.wav", "b.wav"], true)).toEqual([]);
    const entry = detectZipConflicts(["Hit.wav", "hit.wav"], false);
    expect(entry).toHaveLength(1);
    expect(entry[0]?.kind).toBe("entry-collision");
    const manifest = detectZipConflicts(["Manifest.JSON", "a.wav"], true);
    expect(manifest.some((conflict) => conflict.kind === "manifest-collision")).toBe(true);
    expect(detectZipConflicts(["Manifest.JSON"], false)).toEqual([]);
  });

  it("shapes the manifest with source metadata", () => {
    const text = buildManifestText({
      packName: "Pack",
      source: "shelf",
      outputFormat: "zip",
      createdAt: "2026-09-06T00:00:00.000Z",
      files: [
        { id: "a", filename: "a.wav", outputName: "a.wav", format: "wav", duration: 3, fileSize: 9 },
      ],
      skipped: ["gone.wav"],
      missing: ["removed-id"],
    });
    const parsed = JSON.parse(text) as Record<string, unknown>;
    expect(parsed).toMatchObject({
      name: "Pack",
      source: "shelf",
      outputFormat: "zip",
      skipped: ["gone.wav"],
      missing: ["removed-id"],
    });
    expect((parsed.files as unknown[])).toHaveLength(1);
  });

  it("resolves options against settings defaults and rejects mistyped input", () => {
    const settings = { packName: "", defaultFormat: "zip", includeManifest: false };
    const resolved = resolvePackOptions({ raw: {}, settings, source: "recent" });
    expect(resolved).toEqual({
      packName: "Recent Sounds Pack",
      outputFormat: "zip",
      includeManifest: false,
      grantId: null,
    });
    const explicit = resolvePackOptions({
      raw: { packName: " Mix ", outputFormat: "folder", includeManifest: true, grantId: "g1" },
      settings,
      source: "selection",
    });
    expect(explicit.packName).toBe("Mix");
    expect(() =>
      resolvePackOptions({ raw: { outputFormat: "rar" }, settings, source: "selection" }),
    ).toThrow(/folder.*zip/);
    expect(() =>
      resolvePackOptions({ raw: { includeManifest: "yes" }, settings, source: "selection" }),
    ).toThrow(/boolean/);
  });

  it("computes the common parent directory of copied outputs", () => {
    expect(commonParentDir(["/out/a.wav", "/out/b.wav"])).toBe("/out");
    expect(commonParentDir([])).toBe("");
  });

  it("caps packs at the archive service bound", () => {
    expect(MAX_PACK_FILES).toBe(500);
  });
});
