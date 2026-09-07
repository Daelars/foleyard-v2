import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  buildEffectiveV2Catalog,
  createV2ExtendedOperations,
  createV2OperationServices,
  ExtensionV2Host,
  ExtensionV2Registry,
  resolveV2PointContributions,
  validateV2Value,
  type ExtensionV2Definition,
  type IndexedAudioFile,
  type V2HostServices,
  type V2LibraryReadPorts,
  type V2ShelfPorts,
} from "yard-core";

import {
  createSoundShelfV2Definition,
  registerSoundShelfV2Handlers,
  SOUND_SHELF_V2_ADD,
  SOUND_SHELF_V2_CLEAR,
  SOUND_SHELF_V2_ID,
  SOUND_SHELF_V2_LIST,
  SOUND_SHELF_V2_REMOVE,
  type SoundShelfV2ListResult,
  type SoundShelfV2MutationResult,
} from "./index";

// Area: extension v2 S2 (#177). Sound Shelf v2 handlers through the
// real host preflight with an in-memory shelf store: add/remove/clear/
// list, add validation against the Library index (nothing stored on
// reject), read-time repair of unindexed entries, per-extension
// isolation via the op, result-schema validation, permission denial,
// and the no-v1-imports boundary.

const FULL_PERMISSIONS = ["library:read"];

function record(id: string, overrides?: Partial<IndexedAudioFile>): IndexedAudioFile {
  return {
    id,
    path: `/lib/${id}.mp3`,
    filename: `${id}.mp3`,
    libraryRoot: "/lib",
    directory: null,
    format: "mp3",
    duration: 60,
    sampleRate: 44100,
    bitDepth: 16,
    channels: 2,
    fileSize: 4,
    isFavorite: false,
    removedAt: null,
    lastScannedAt: "2026-09-06T00:00:00.000Z",
    mtimeMs: 1,
    ...overrides,
  };
}

type World = {
  host: ExtensionV2Host;
  store: Map<string, string[]>;
  definition: ExtensionV2Definition;
};

function world(overrides?: {
  granted?: string[];
  files?: IndexedAudioFile[];
  seed?: string[];
}): World {
  const definition = createSoundShelfV2Definition();
  const registry = new ExtensionV2Registry();
  registry.register(definition);
  const granted = overrides?.granted ?? FULL_PERMISSIONS;
  const files = overrides?.files ?? [record("a"), record("b"), record("c")];
  const byId = new Map(files.map((file) => [file.id, file]));
  const library: V2LibraryReadPorts = {
    getFileById: (id) => byId.get(id) ?? null,
    getFilesByIds: (ids) => ids.flatMap((id) => (byId.get(id) ? [byId.get(id)!] : [])),
    listPage: () => ({ files, nextCursor: null }),
  };
  const store = new Map<string, string[]>();
  if (overrides?.seed) store.set(SOUND_SHELF_V2_ID, [...overrides.seed]);
  const shelfPorts: V2ShelfPorts = {
    readIds: (extensionId) => [...(store.get(extensionId) ?? [])],
    writeIds: (extensionId, ids) => {
      store.set(extensionId, [...ids]);
    },
  };
  const services: V2HostServices = {
    registry,
    isEnabled: () => true,
    capabilities: {},
    grantedPermissions: () => [...granted],
    ports: library,
    authorizeGrant: () => ({ ok: true }),
    createOperations: (binding) => ({
      ...createV2OperationServices({
        ...binding,
        grants: { authorize: () => ({ ok: false, message: "no grants in this port" }) } as never,
        library,
        files: {
          readFileBytes: async () => new Uint8Array(),
          copyFile: async () => {},
          writeFileBytes: async () => {},
          deleteFile: async () => {},
          exists: async () => false,
          libraryRoots: () => ["/lib"],
          pathIo: () => ({
            realpath: async (p) => p,
            lstat: async () => ({ exists: true, isLink: false }),
          }),
        },
        archive: { createZipArchive: async () => ({ bytesWritten: 0 }) },
        settings: { readRaw: () => undefined, writeRaw: () => {} },
        extensionState: { readAll: () => ({}), writeAll: () => {} },
      }),
      ...createV2ExtendedOperations({
        extensionId: binding.extensionId,
        effectivePermissions: binding.effectivePermissions,
        library,
        shelf: shelfPorts,
      }),
    }),
  };
  const host = new ExtensionV2Host(services);
  registerSoundShelfV2Handlers(host);
  return { host, store, definition };
}

function immediateValue<T>(result: unknown): T {
  expect(result).toMatchObject({ ok: true });
  const outcome = (result as { outcome: { kind: string; value: unknown } }).outcome;
  expect(outcome.kind).toBe("immediate");
  return outcome.value as T;
}

async function run(
  world: World,
  commandId: string,
  fileIds: string[],
): Promise<unknown> {
  return world.host.execute({
    extensionId: SOUND_SHELF_V2_ID,
    commandId,
    input: {},
    selection: { fileIds },
  });
}

describe("sound-shelf-v2 add/remove/clear/list", () => {
  it("adds selected sounds and persists the shelf", async () => {
    const w = world();
    const value = immediateValue<SoundShelfV2MutationResult>(
      await run(w, SOUND_SHELF_V2_ADD, ["a", "b"]),
    );
    expect(value).toEqual({ added: 2, removed: 0, total: 2 });
    expect(w.store.get(SOUND_SHELF_V2_ID)).toEqual(["a", "b"]);
    const command = w.definition.commands.find((c) => c.id === SOUND_SHELF_V2_ADD)!;
    expect(validateV2Value(command.result!, value, "result")).toBeNull();
  });

  it("dedupes re-adds so the shelf never doubles an entry", async () => {
    const w = world({ seed: ["a"] });
    const value = immediateValue<SoundShelfV2MutationResult>(
      await run(w, SOUND_SHELF_V2_ADD, ["a", "b"]),
    );
    expect(value).toEqual({ added: 1, removed: 0, total: 2 });
    expect(w.store.get(SOUND_SHELF_V2_ID)).toEqual(["a", "b"]);
  });

  it("removes selected sounds and reports the remaining total", async () => {
    const w = world({ seed: ["a", "b", "c"] });
    const value = immediateValue<SoundShelfV2MutationResult>(
      await run(w, SOUND_SHELF_V2_REMOVE, ["b"]),
    );
    expect(value).toEqual({ added: 0, removed: 1, total: 2 });
    expect(w.store.get(SOUND_SHELF_V2_ID)).toEqual(["a", "c"]);
  });

  it("clears the whole shelf", async () => {
    const w = world({ seed: ["a", "b"] });
    const value = immediateValue<SoundShelfV2MutationResult>(
      await run(w, SOUND_SHELF_V2_CLEAR, []),
    );
    expect(value).toEqual({ added: 0, removed: 2, total: 0 });
    expect(w.store.get(SOUND_SHELF_V2_ID)).toEqual([]);
  });

  it("lists the shelf and prunes entries that left the Library index", async () => {
    const w = world({ files: [record("a"), record("c")], seed: ["a", "gone", "c"] });
    const value = immediateValue<SoundShelfV2ListResult>(await run(w, SOUND_SHELF_V2_LIST, []));
    expect(value.ids).toEqual(["a", "c"]);
    expect(value.repaired).toEqual(["gone"]);
    expect(value.total).toBe(2);
    // The repaired list is written back so the scratchpad never
    // accumulates dead entries.
    expect(w.store.get(SOUND_SHELF_V2_ID)).toEqual(["a", "c"]);
    const command = w.definition.commands.find((c) => c.id === SOUND_SHELF_V2_LIST)!;
    expect(validateV2Value(command.result!, value, "result")).toBeNull();
  });
});

describe("sound-shelf-v2 boundaries", () => {
  it("rejects a removed selected record before writing to the shelf", async () => {
    const w = world({ files: [record("gone", { removedAt: "2026-09-06T00:00:00.000Z" })] });
    const result = await run(w, SOUND_SHELF_V2_ADD, ["gone"]);
    expect((result as { ok: boolean }).ok).toBe(false);
    expect(w.store.has(SOUND_SHELF_V2_ID)).toBe(false);
  });

  it("denies execution when library:read is not approved", async () => {
    const w = world({ granted: [] });
    const result = await run(w, SOUND_SHELF_V2_ADD, ["a"]);
    expect((result as { ok: boolean }).ok).toBe(false);
    expect(w.store.has(SOUND_SHELF_V2_ID)).toBe(false);
  });

  it("exposes commands through the generic contribution points", () => {
    const { definition } = world();
    const registry = new ExtensionV2Registry();
    registry.register(definition);
    const catalog = buildEffectiveV2Catalog(registry, () => [...FULL_PERMISSIONS]);
    const ui = {
      isEnabled: () => true,
      capabilities: {},
      grantedPermissions: () => [...FULL_PERMISSIONS],
    };
    const fileMenu = resolveV2PointContributions(catalog.entries, "context-menu", { fileIds: ["a"] }, ui);
    expect(fileMenu.map((item) => item.commandId).sort()).toEqual(
      [SOUND_SHELF_V2_ADD, SOUND_SHELF_V2_REMOVE].sort(),
    );
    const sidebar = resolveV2PointContributions(catalog.entries, "sidebar", { fileIds: [] }, ui);
    expect(sidebar.map((item) => item.commandId)).toEqual([SOUND_SHELF_V2_LIST]);
  });

  it("never imports v1 extension modules", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const sources = ["definition.ts", "handlers.ts", "index.ts"].map((file) =>
      readFileSync(join(here, file), "utf8"),
    );
    for (const text of sources) {
      expect(text).not.toMatch(/@foleyard\/sound-shelf"/);
      expect(text).not.toMatch(/from\s+["'][^"']*extensions\//);
      const specifiers = [...text.matchAll(/from\s+["']([^"']+)["']/g)].map((match) => match[1]);
      for (const specifier of specifiers) {
        expect(specifier === "yard-core" || specifier?.startsWith("./")).toBe(true);
      }
    }
  });
});
