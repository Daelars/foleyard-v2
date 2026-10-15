import { describe, expect, it } from "vitest";

import {
  createV2ExtendedOperations,
  createV2OperationServices,
  extendedOperationsOf,
  ExtensionV2Host,
  ExtensionV2Registry,
  immediateV2Result,
  V2_EXTENSION_API_VERSION,
  V2GrantStore,
  type ExtensionV2Definition,
  type IndexedAudioFile,
  type V2AnalysisPorts,
  type V2PathIo,
} from "@yard-core";

// Area: extension v2 analysis authorization (#268). Audio inference is a
// file-content read: it must go through the same Library-root and
// file-read guard as `files.readFile`, through the same host wiring the
// production adapters use. A backend must never be handed a raw indexed
// path the extension was not authorized to read — this was the bypass.

const EXTENSION_ID = "fixture-analysis";

function fakePathIo(existingPaths: string[]): V2PathIo {
  const existing = new Set(existingPaths);
  return {
    realpath: async (candidate) => {
      if (!existing.has(candidate)) {
        throw Object.assign(new Error(`ENOENT: ${candidate}`), { code: "ENOENT" });
      }
      return candidate;
    },
    lstat: async (candidate) => ({ exists: existing.has(candidate), isLink: false }),
  };
}

function record(id: string, path: string, removedAt: string | null = null): IndexedAudioFile {
  return {
    id,
    path,
    filename: `${id}.mp3`,
    libraryRoot: "/lib",
    directory: null,
    format: "mp3",
    duration: 60,
    sampleRate: 44100,
    bitDepth: 16,
    channels: 2,
    fileSize: 1024,
    isFavorite: false,
    removedAt,
    lastScannedAt: "2026-09-06T00:00:00.000Z",
    mtimeMs: 1,
  };
}

function definition(permissions: string[]): ExtensionV2Definition {
  return {
    id: EXTENSION_ID,
    name: "Fixture Analysis",
    version: "0.1.0",
    apiVersion: V2_EXTENSION_API_VERSION,
    description: "Analysis authorization conformance fixture.",
    permissions: permissions as ExtensionV2Definition["permissions"],
    commands: [
      {
        id: "fixture-analysis.embed",
        title: "Embed",
        description: "Embed one sound.",
        scope: "global",
        input: {
          kind: "object",
          properties: { id: { kind: "string" } },
          required: ["id"],
        },
        result: {
          kind: "object",
          properties: { message: { kind: "string" } },
          required: ["message"],
        },
      },
    ],
  };
}

const OUTCOMES = { outcomes: [] as Array<{ ok: boolean; message?: string }>, analyzed: [] as string[] };

function world(granted: string[]) {
  OUTCOMES.outcomes = [];
  OUTCOMES.analyzed = [];
  const files = [
    record("a", "/lib/a.mp3"),
    record("gone", "/lib/gone.mp3", "2026-09-06T00:00:00.000Z"),
    record("outside", "/outside/evil.mp3"),
  ];
  const byId = new Map(files.map((file) => [file.id, file]));
  const library = {
    getFileById: (id: string) => byId.get(id) ?? null,
    getFilesByIds: (ids: string[]) => ids.flatMap((id) => (byId.get(id) ? [byId.get(id)!] : [])),
    listPage: () => ({ files, nextCursor: null as string | null }),
  };
  const analysisReads = {
    libraryRoots: () => ["/lib"],
    pathIo: () =>
      fakePathIo(["/lib", "/lib/a.mp3", "/lib/gone.mp3", "/outside", "/outside/evil.mp3"]),
  };
  const analysis: V2AnalysisPorts = {
    modelStatus: (modelId) => ({
      modelId,
      state: "ready",
      downloadedBytes: 1,
      totalBytes: 1,
      backendAvailable: true,
    }),
    downloadModel: async () => ({ bytes: 1 }),
    embedAudio: async (source) => {
      OUTCOMES.analyzed.push(source.canonicalPath);
      return { dim: 1, vec: [1] };
    },
    embedTexts: async (texts) => texts.map(() => [1]),
    backendAvailable: () => true,
  };
  const registry = new ExtensionV2Registry();
  registry.register(definition(granted));
  const host = new ExtensionV2Host({
    registry,
    isEnabled: () => true,
    capabilities: {},
    grantedPermissions: () => granted,
    ports: library,
    createOperations: (binding) => ({
      ...createV2OperationServices({
        extensionId: binding.extensionId,
        invocationId: binding.invocationId,
        effectivePermissions: binding.effectivePermissions,
        grants: new V2GrantStore(),
        library,
        files: {
          readFileBytes: async () => new Uint8Array(),
          copyFile: async () => ({ device: "memory", fileId: "unused" }),
          writeFileBytes: async () => ({ device: "memory", fileId: "unused" }),
          deleteFileIfVersion: async () => ({ removed: false }),
          libraryRoots: () => ["/lib"],
          pathIo: () => fakePathIo(["/lib"]),
        },
        archive: {
          createZipArchive: async () => ({
            bytesWritten: 0,
            version: { device: "memory", fileId: "unused" },
          }),
        },
        settings: { readRaw: () => undefined, writeRaw: () => {} },
        extensionState: { readAll: () => ({}), writeAll: () => {} },
      }),
      ...createV2ExtendedOperations({
        extensionId: binding.extensionId,
        effectivePermissions: binding.effectivePermissions,
        library,
        analysis,
        analysisReads,
      }),
    }),
  });
  host.registerHandler(EXTENSION_ID, "fixture-analysis.embed", async (context) => {
    const id = String((context.invocation.input as { id: string }).id);
    try {
      await extendedOperationsOf(context).analysis.embedAudio(id);
      OUTCOMES.outcomes.push({ ok: true });
    } catch (error) {
      OUTCOMES.outcomes.push({ ok: false, message: error instanceof Error ? error.message : String(error) });
    }
    return immediateV2Result({ message: "done" });
  });
  return host;
}

function embed(host: ExtensionV2Host, id: string) {
  return host.execute({
    extensionId: EXTENSION_ID,
    commandId: "fixture-analysis.embed",
    input: { id },
    selection: {},
  });
}

const FULL = ["library:read", "files:read", "embeddings:read", "embeddings:write"];

describe("analysis inference through the authorized read path (#268)", () => {
  it("authorizes an in-root sound and hands the backend the canonical path", async () => {
    const host = world(FULL);
    const result = await embed(host, "a");
    expect(result.ok).toBe(true);
    expect(OUTCOMES.outcomes).toEqual([{ ok: true }]);
    expect(OUTCOMES.analyzed).toEqual(["/lib/a.mp3"]);
  });

  it("rejects removed and outside-root sounds without reaching the backend", async () => {
    const host = world(FULL);
    await embed(host, "gone");
    await embed(host, "outside");
    await embed(host, "missing");
    expect(OUTCOMES.outcomes.map((entry) => entry.ok)).toEqual([false, false, false]);
    expect(OUTCOMES.outcomes[0]!.message).toMatch(/not in the Library index/);
    expect(OUTCOMES.outcomes[1]!.message).toMatch(/outside the readable Library roots/);
    expect(OUTCOMES.outcomes[2]!.message).toMatch(/not in the Library index/);
    // The bypass this ticket closes: no raw indexed path was ever decoded.
    expect(OUTCOMES.analyzed).toEqual([]);
  });

  it("requires files:read as well as embeddings:read", async () => {
    const embeddingsOnly = world(["library:read", "embeddings:read"]);
    await embed(embeddingsOnly, "a");
    expect(OUTCOMES.outcomes[0]).toMatchObject({ ok: false });
    expect(OUTCOMES.outcomes[0]!.message).toMatch(/"files:read"/);
    expect(OUTCOMES.analyzed).toEqual([]);

    const filesOnly = world(["library:read", "files:read"]);
    await embed(filesOnly, "a");
    expect(OUTCOMES.outcomes[0]).toMatchObject({ ok: false });
    expect(OUTCOMES.outcomes[0]!.message).toMatch(/"embeddings:read"/);
    expect(OUTCOMES.analyzed).toEqual([]);
  });
});
