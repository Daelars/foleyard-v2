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
  type V2CollectionPorts,
  type V2ExtendedOperationServices,
  type V2PathIo,
  type V2ShelfPorts,
} from "@yard-core";
import { createV2CollectionPorts } from "@/lib/extensions-v2/organization";
import { createV2LibraryMutationPorts } from "@/lib/extensions-v2/library-mutations";
import { createV2ShelfPorts } from "@/lib/extensions-v2/shelf";
import { getV2Events } from "@/lib/extensions-v2/events";

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

// Area: extension v2 E1 (#176). The remaining app-adapter contracts are
// proved through the same path the ports use: a permission-only fixture
// definition (no requiredCapabilities, make-pack-v2 precedent) executed
// by ExtensionV2Host, with the production app adapters (injectable
// repository/filesystem doubles stand in for SQLite and disk; the
// adapter code under test is the shipped code).

const EXTENSION_ID = "fixture-gaps";

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
    fileSize: 1024,
    isFavorite: false,
    removedAt: null,
    lastScannedAt: "2026-09-06T00:00:00.000Z",
    mtimeMs: 1,
  };
}

function definition(permissions: string[]): ExtensionV2Definition {
  return {
    id: EXTENSION_ID,
    name: "Fixture Gaps",
    version: "0.1.0",
    apiVersion: V2_EXTENSION_API_VERSION,
    description: "E1 operation-gap conformance fixture.",
    permissions: permissions as ExtensionV2Definition["permissions"],
    commands: [
      {
        id: "fixture-gaps.run",
        title: "Run",
        description: "Run the gap probe.",
        scope: "global",
        result: {
          kind: "object",
          properties: { message: { kind: "string" } },
          required: ["message"],
        },
      },
    ],
  };
}

type World = {
  host: (granted: string[], overrides?: { shelf?: V2ShelfPorts }) => ExtensionV2Host;
  order: string[];
  shelfRows: Map<string, unknown>;
  collections: Map<string, { id: string; name: string; filter: string }>;
};

function world(): World {
  const order: string[] = [];
  const shelfRows = new Map<string, unknown>();
  const collections = new Map<string, { id: string; name: string; filter: string }>();
  const files = [record("a"), record("b")];
  const byId = new Map(files.map((file) => [file.id, file]));
  const library = {
    getFileById: (id: string) => byId.get(id) ?? null,
    getFilesByIds: (ids: string[]) => ids.flatMap((id) => (byId.get(id) ? [byId.get(id)!] : [])),
    listPage: () => ({ files, nextCursor: null as string | null }),
  };
  const collectionPorts: V2CollectionPorts = createV2CollectionPorts({
    collections: {
      list: () => [...collections.values()].map((entry) => ({ ...entry, isSmart: true, filter: entry.filter, fileCount: 0 })),
      get: (id) => {
        const entry = collections.get(id);
        return entry ? { ...entry, isSmart: true, fileCount: 0 } : null;
      },
      createSmart: (name, filter) => {
        order.push("persist:collections");
        const id = `c${collections.size + 1}`;
        collections.set(id, { id, name, filter });
        return id;
      },
      updateSmartFilter: (id, filter) => {
        order.push("persist:collections");
        collections.set(id, { ...collections.get(id)!, filter });
      },
      attachFile: () => {
        order.push("persist:collections");
      },
      detachFile: () => {
        order.push("persist:collections");
      },
      deleteCollection: (id) => {
        order.push("persist:collections");
        collections.delete(id);
      },
    },
    notify: () => {
      order.push("notify:collections");
    },
  });
  const shelfPorts: V2ShelfPorts = createV2ShelfPorts({
    read: (key) => shelfRows.get(key),
    write: (key, value) => {
      order.push("persist:shelf");
      shelfRows.set(key, value);
    },
    notify: () => {
      order.push("notify:shelf");
    },
  });
  const host = (
    granted: string[],
    overrides?: { shelf?: V2ShelfPorts },
  ): ExtensionV2Host => {
    const registry = new ExtensionV2Registry();
    registry.register(definition(granted));
    return new ExtensionV2Host({
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
            copyFile: async () => {},
            writeFileBytes: async () => {},
            deleteFile: async () => {},
            exists: async () => false,
            libraryRoots: () => ["/lib"],
            pathIo: () => fakePathIo(["/lib"]),
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
          shelf: overrides?.shelf ?? shelfPorts,
        }),
      }),
    });
  };
  return { host, order, shelfRows, collections };
}

function run(host: ExtensionV2Host, probe: (ops: V2ExtendedOperationServices) => unknown | Promise<unknown>) {
  host.registerHandler(EXTENSION_ID, "fixture-gaps.run", async (context) => {
    const probed = await probe(extendedOperationsOf(context));
    return immediateV2Result({ message: JSON.stringify(probed ?? null) });
  });
  return host.execute({
    extensionId: EXTENSION_ID,
    commandId: "fixture-gaps.run",
    selection: {},
  });
}

const FULL = [
  "library:read",
  "library:write",
  "collections:read",
  "collections:write",
  "tags:read",
  "tags:write",
  "files:read",
  "files:delete",
];

describe("E1 operation gaps through the host path", () => {
  it("persists library mutations before notifying", () => {
    const order: string[] = [];
    const ports = createV2LibraryMutationPorts({
      markRemovedByPaths: () => {
        order.push("mark");
      },
      insertRecords: () => {
        order.push("insert");
      },
      notify: () => {
        order.push("notify");
      },
    });
    ports.markRemovedByPaths(["/lib/a.mp3"], "2026-09-06T00:00:00.000Z", "2026-09-06T00:00:00.000Z");
    expect(order).toEqual(["mark", "notify"]);
    ports.insertRecords([], "2026-09-06T00:00:00.000Z");
    expect(order).toEqual(["mark", "notify", "insert", "notify"]);
  });

  it("adds and lists shelf sounds, repairing dead IDs through the app adapter", async () => {
    const state = world();
    const host = state.host(FULL);
    const first = await run(host, (ops) => ops.shelf.add(["a", "b"]));
    expect(first.ok).toBe(true);
    // Corrupt the stored row behind the service with a dead ID.
    state.shelfRows.set("v2shelf:fixture-gaps", { ids: ["a", "gone"] });
    const repaired: { ids: string[]; repaired: string[] }[] = [];
    const host2 = state.host(FULL);
    const second = await run(host2, (ops) => {
      repaired.push(ops.shelf.list());
      return null;
    });
    expect(second.ok).toBe(true);
    expect(repaired[0]).toEqual({ ids: ["a"], repaired: ["gone"] });
    expect(state.order).toEqual(
      expect.arrayContaining(["persist:shelf", "notify:shelf"]),
    );
    expect(state.order.indexOf("persist:shelf")).toBeLessThan(
      state.order.indexOf("notify:shelf"),
    );
  });

  it("rejects invalid smart queries with reasons, never silent empty", async () => {
    const state = world();
    const host = state.host(FULL);
    const result = await run(host, (ops) => ops.collections.createSmart("Night", "not-json"));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/invalid/);
    expect(state.collections.size).toBe(0);
  });

  it("emits adapter notifications observers can reread from", async () => {
    const state = world();
    const seen: string[] = [];
    const unsubscribe = getV2Events().subscribe("state-changed", (payload) => {
      if (payload.extensionId === EXTENSION_ID) {
        seen.push(JSON.stringify(state.shelfRows.get("v2shelf:fixture-gaps")));
      }
    });
    try {
      // The production shelf adapter persists the row, then emits
      // state-changed through defaultNotify (persist-before-notify): an
      // observer that re-reads on receipt always sees the written row.
      const notifying = createV2ShelfPorts({
        read: (key) => state.shelfRows.get(key),
        write: (key, value) => {
          state.shelfRows.set(key, value);
        },
      });
      const host = state.host(FULL, { shelf: notifying });
      const result = await run(host, (ops) => ops.shelf.add(["a"]));
      expect(result.ok).toBe(true);
    } finally {
      unsubscribe();
    }
    expect(seen).toEqual([JSON.stringify({ ids: ["a"] })]);
  });
});
