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
  type Collection,
  type ExtensionV2Definition,
  type IndexedAudioFile,
  type V2CollectionPorts,
  type V2HostServices,
  type V2LibraryReadPorts,
} from "yard-core";

import {
  createSmartCollectionsV2Definition,
  registerSmartCollectionsV2Handlers,
  SMART_COLLECTIONS_V2_ID,
  SMART_COLLECTIONS_V2_SAVE_SEARCH,
  type SmartCollectionsV2SaveResult,
} from "./index";

// Area: extension v2 C3 (#178). Smart Collections v2 save-search
// through the real host preflight with an in-memory collections port
// that mirrors the app adapter (validates the query, rejects invalid
// queries with a reason). Covers a successful save, invalid-query
// rejection (never a silent empty Collection), missing name/query,
// result-schema validation, permission denial, and the no-v1-imports
// boundary.

const FULL_PERMISSIONS = ["collections:read", "collections:write", "library:read"];

function record(id: string): IndexedAudioFile {
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
  };
}

/** Extract the trimmed `q` from the stored filter JSON, or null. */
function extractQuery(filter: string): string | null {
  try {
    const parsed = JSON.parse(filter) as { q?: unknown };
    return typeof parsed.q === "string" && parsed.q.trim() ? parsed.q.trim() : null;
  } catch {
    return null;
  }
}

type World = {
  host: ExtensionV2Host;
  collections: Map<string, Collection>;
  definition: ExtensionV2Definition;
};

function world(overrides?: { granted?: string[]; invalidQuery?: string }): World {
  const definition = createSmartCollectionsV2Definition();
  const registry = new ExtensionV2Registry();
  registry.register(definition);
  const granted = overrides?.granted ?? FULL_PERMISSIONS;
  const files = [record("a")];
  const byId = new Map(files.map((file) => [file.id, file]));
  const library: V2LibraryReadPorts = {
    getFileById: (id) => byId.get(id) ?? null,
    getFilesByIds: (ids) => ids.flatMap((id) => (byId.get(id) ? [byId.get(id)!] : [])),
    listPage: () => ({ files, nextCursor: null }),
  };
  const store = new Map<string, Collection>();
  let seq = 0;
  const collectionPorts: V2CollectionPorts = {
    list: () => [...store.values()],
    get: (id) => store.get(id) ?? null,
    createSmart: (name, filter) => {
      // Mirror the app adapter: an invalid query fails with a reason
      // instead of creating a Collection that matches nothing.
      const query = extractQuery(filter);
      if (!query || (overrides?.invalidQuery && query === overrides.invalidQuery)) {
        throw new Error(
          `Smart Collection query ${JSON.stringify(filter)} is invalid; save a query the search box accepts.`,
        );
      }
      const id = `c${(seq += 1)}`;
      store.set(id, { id, name, isSmart: true, filter, fileCount: 0 } as Collection);
      return id;
    },
    updateSmartFilter: () => {},
    attachFile: () => {},
    detachFile: () => {},
    deleteCollection: (id) => {
      store.delete(id);
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
        grants: { authorize: () => ({ ok: false, message: "no grants" }) } as never,
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
        collections: collectionPorts,
      }),
    }),
  };
  const host = new ExtensionV2Host(services);
  registerSmartCollectionsV2Handlers(host);
  return { host, collections: store, definition };
}

function immediateValue<T>(result: unknown): T {
  expect(result).toMatchObject({ ok: true });
  const outcome = (result as { outcome: { kind: string; value: unknown } }).outcome;
  expect(outcome.kind).toBe("immediate");
  return outcome.value as T;
}

async function save(world: World, input: Record<string, unknown>): Promise<unknown> {
  return world.host.execute({
    extensionId: SMART_COLLECTIONS_V2_ID,
    commandId: SMART_COLLECTIONS_V2_SAVE_SEARCH,
    input,
    selection: {},
  });
}

describe("smart-collections-v2 save-search", () => {
  it("saves a search as a smart collection", async () => {
    const w = world();
    const value = immediateValue<SmartCollectionsV2SaveResult>(
      await save(w, { name: "Kicks", query: "kick" }),
    );
    expect(value).toMatchObject({ name: "Kicks", query: "kick" });
    expect(value.collectionId).toBeTruthy();
    const stored = w.collections.get(value.collectionId)!;
    expect(stored.filter).toBe(JSON.stringify({ q: "kick" }));
    const command = w.definition.commands.find((c) => c.id === SMART_COLLECTIONS_V2_SAVE_SEARCH)!;
    expect(validateV2Value(command.result!, value, "result")).toBeNull();
  });

  it("rejects an invalid query with a reason, never a silent empty collection", async () => {
    const w = world({ invalidQuery: "((" });
    const result = await save(w, { name: "Broken", query: "((" });
    expect((result as { ok: boolean }).ok).toBe(false);
    if (!(result as { ok: boolean }).ok) {
      expect((result as { code: string; message: string }).code).toBe("input-invalid");
      expect((result as { message: string }).message).toMatch(/invalid/i);
    }
    expect(w.collections.size).toBe(0);
  });

  it("rejects a missing name before touching collections", async () => {
    const w = world();
    const result = await save(w, { query: "kick" });
    expect((result as { ok: boolean }).ok).toBe(false);
    expect(w.collections.size).toBe(0);
  });

  it("rejects a blank query before touching collections", async () => {
    const w = world();
    const result = await save(w, { name: "Empty", query: "   " });
    expect((result as { ok: boolean }).ok).toBe(false);
    expect(w.collections.size).toBe(0);
  });

  it("denies execution when collections:write is not approved", async () => {
    const w = world({ granted: ["collections:read", "library:read"] });
    const result = await save(w, { name: "Kicks", query: "kick" });
    expect((result as { ok: boolean }).ok).toBe(false);
    expect(w.collections.size).toBe(0);
  });
});

describe("smart-collections-v2 boundaries", () => {
  it("exposes save-search through the generic contribution points", () => {
    const { definition } = world();
    const registry = new ExtensionV2Registry();
    registry.register(definition);
    const catalog = buildEffectiveV2Catalog(registry, () => [...FULL_PERMISSIONS]);
    const ui = {
      isEnabled: () => true,
      capabilities: {},
      grantedPermissions: () => [...FULL_PERMISSIONS],
    };
    const sidebar = resolveV2PointContributions(catalog.entries, "sidebar", { fileIds: [] }, ui);
    expect(sidebar.map((item) => item.commandId)).toEqual([SMART_COLLECTIONS_V2_SAVE_SEARCH]);
    const palette = resolveV2PointContributions(catalog.entries, "palette", { fileIds: [] }, ui);
    expect(palette.map((item) => item.commandId)).toEqual([SMART_COLLECTIONS_V2_SAVE_SEARCH]);
  });

  it("never imports v1 extension modules", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const sources = ["definition.ts", "handlers.ts", "index.ts"].map((file) =>
      readFileSync(join(here, file), "utf8"),
    );
    for (const text of sources) {
      expect(text).not.toMatch(/@foleyard\/smart-collections"/);
      expect(text).not.toMatch(/from\s+["'][^"']*extensions\//);
      const specifiers = [...text.matchAll(/from\s+["']([^"']+)["']/g)].map((match) => match[1]);
      for (const specifier of specifiers) {
        expect(specifier === "yard-core" || specifier?.startsWith("./")).toBe(true);
      }
    }
  });
});
