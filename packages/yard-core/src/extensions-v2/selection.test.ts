import { describe, expect, it } from "vitest";

import {
  createGreeterFixtureDefinition,
  defaultV2SelectionResolvers,
  ExtensionV2Registry,
  parseV2SelectionSnapshot,
  resolveV2Selection,
  type V2LibraryPorts,
} from "./index";
import { audioFile, libraryPorts } from "./test-helpers";

// Area: extension v2 R2 (#166). Host-boundary selection: untrusted IDs are
// validated and scoped, client file paths are rejected (never
// authorization), and IDs resolve through authorized Library operations.
// Shared fakes live in test-helpers.ts.

describe("parseV2SelectionSnapshot", () => {
  it("accepts missing snapshots as empty and dedupes IDs", () => {
    expect(parseV2SelectionSnapshot(undefined)).toEqual({
      ok: true,
      snapshot: { fileIds: [] },
    });
    const parsed = parseV2SelectionSnapshot({ fileIds: ["a", "a", "b"] });
    expect(parsed).toEqual({ ok: true, snapshot: { fileIds: ["a", "b"] } });
  });

  it("rejects client file paths instead of resolving them", () => {
    for (const raw of [
      { paths: ["/library/evil.mp3"] },
      { filePaths: ["/library/evil.mp3"] },
      { file: { path: "/library/evil.mp3" } },
    ]) {
      const parsed = parseV2SelectionSnapshot(raw);
      expect(parsed.ok).toBe(false);
      if (!parsed.ok) {
        expect(parsed.failure.code).toBe("selection-invalid");
        expect(parsed.failure.message).toMatch("never authorization");
      }
    }
  });

  it("rejects non-string IDs and over-limit selections", () => {
    const badId = parseV2SelectionSnapshot({ fileIds: ["a", 7] });
    expect(badId.ok).toBe(false);

    const tooMany = parseV2SelectionSnapshot({
      fileIds: Array.from({ length: 501 }, (_, index) => `id-${index}`),
    });
    expect(tooMany.ok).toBe(false);
    if (!tooMany.ok) {
      expect(tooMany.failure.code).toBe("payload-too-large");
    }
  });

  it("validates folder, Collection, and drop fields", () => {
    expect(parseV2SelectionSnapshot({ fileIds: [], folderPath: " " }).ok).toBe(false);
    expect(parseV2SelectionSnapshot({ fileIds: [], collectionId: 9 }).ok).toBe(false);
    expect(parseV2SelectionSnapshot({ fileIds: [], dropFileCount: -1 }).ok).toBe(false);
    expect(
      parseV2SelectionSnapshot({
        fileIds: [],
        folderPath: "/library",
        collectionId: "col-1",
        dropFileCount: 2,
      }),
    ).toEqual({
      ok: true,
      snapshot: {
        fileIds: [],
        folderPath: "/library",
        collectionId: "col-1",
        dropFileCount: 2,
      },
    });
  });
});

describe("resolveV2Selection", () => {
  function greetCommand() {
    const registry = new ExtensionV2Registry();
    registry.register(createGreeterFixtureDefinition());
    return registry.get("fixture-greeter")!.commands[0]!;
  }

  it("resolves IDs to authorized Library records, not client paths", async () => {
    const ports = libraryPorts([audioFile("a"), audioFile("b")]);
    const resolved = await resolveV2Selection(
      { fileIds: ["a", "b"] },
      greetCommand(),
      "fixture-greeter",
      ports,
    );
    expect(resolved.ok).toBe(true);
    if (resolved.ok) {
      expect(resolved.selection.files.map((file) => file.path)).toEqual([
        "/library/a.mp3",
        "/library/b.mp3",
      ]);
    }
  });

  it("reports missing or removed sounds as unresolvable with IDs", async () => {
    const ports = libraryPorts([audioFile("a"), audioFile("gone", { removedAt: "2026-09-01" })]);
    const resolved = await resolveV2Selection(
      { fileIds: ["a", "gone", "missing"] },
      greetCommand(),
      "fixture-greeter",
      ports,
    );
    expect(resolved.ok).toBe(false);
    if (!resolved.ok) {
      expect(resolved.failure.code).toBe("selection-unresolvable");
      expect(resolved.failure.message).toMatch("gone");
      expect(resolved.failure.message).toMatch("missing");
    }
  });

  it("reports empty required selections distinctly from unresolvable ones", async () => {
    const ports = libraryPorts([]);
    const resolved = await resolveV2Selection(
      { fileIds: [] },
      greetCommand(),
      "fixture-greeter",
      ports,
    );
    expect(resolved.ok).toBe(false);
    if (!resolved.ok) {
      expect(resolved.failure.code).toBe("selection-empty");
      expect(resolved.failure.message).toMatch("select");
    }
  });

  it("resolves Collection scope through the scope contract", async () => {
    const registry = new ExtensionV2Registry();
    registry.register(createGreeterFixtureDefinition());
    const definition = registry.get("fixture-greeter")!;
    const command = { ...definition.commands[0]!, scope: "collection" as const };
    const ports: V2LibraryPorts = {
      ...libraryPorts([]),
      collectionExists: (id) => id === "col-1",
    };
    const ok = await resolveV2Selection(
      { fileIds: [], collectionId: "col-1" },
      command,
      "fixture-greeter",
      ports,
    );
    expect(ok.ok).toBe(true);

    const missing = await resolveV2Selection(
      { fileIds: [], collectionId: "col-9" },
      command,
      "fixture-greeter",
      ports,
    );
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.failure.code).toBe("selection-unresolvable");
  });

  it("uses scope-contract overrides without command-name branches", async () => {
    const command = greetCommand();
    const ports = libraryPorts([audioFile("a")]);
    const table = defaultV2SelectionResolvers(command, "fixture-greeter");
    expect(Object.keys(table).sort()).toEqual(
      ["collection", "drop", "file", "folder", "global", "selection"],
    );
    const resolved = await resolveV2Selection(
      { fileIds: ["a"] },
      { ...command, scope: "drop" },
      "fixture-greeter",
      ports,
      {
        drop: (snapshot, next) => {
          const files = next.getFilesByIds(snapshot.fileIds);
          return { ok: true, selection: { files } };
        },
      },
    );
    expect(resolved.ok).toBe(true);
    if (resolved.ok) {
      expect(resolved.selection.files.map((file) => file.id)).toEqual(["a"]);
    }
  });
});
