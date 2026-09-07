import { describe, expect, it } from "vitest";

import type { IndexedAudioFile } from "../domain/audio-file";
import {
  createGreeterFixtureDefinition,
  createV2ExtendedOperations,
  createV2OperationServices,
  denyAllV2ExtendedOperations,
  ExtensionV2Host,
  ExtensionV2Registry,
  immediateV2Result,
  V2GrantStore,
  V2OperationError,
  V2SourceGrantStore,
  type V2CollectionPorts,
  type V2ExtendedOperationFactoryArgs,
  type V2ExtendedOperationServices,
  type V2FolderScanPorts,
  type V2LibraryMutationPorts,
  type V2ShelfPorts,
  type V2TagPorts,
} from "./index";
import { fakePathIo } from "./test-helpers";
import { audioFile, libraryPorts } from "./test-helpers";

// Area: extension v2 E1 (#176). The extended composer layers the
// operation gaps over the base services: handlers reach every group
// through the same host execution path the ports will use, and an
// unauthorized handler stays confined.

function record(id: string, path = `/lib/${id}.mp3`): IndexedAudioFile {
  return audioFile(id, { path, filename: `${id}.mp3` });
}

function extendedArgs(overrides?: Partial<V2ExtendedOperationFactoryArgs>): V2ExtendedOperationFactoryArgs {
  const files = [record("a"), record("b")];
  const library = {
    ...libraryPorts(files),
    listPage: (cursor: string | null, limit: number) => ({ files, nextCursor: null as string | null }),
  };
  const mutations: V2LibraryMutationPorts = {
    markRemovedByPaths: () => {},
    insertRecords: () => {},
  };
  const collections: V2CollectionPorts = {
    list: () => [],
    get: () => null,
    createSmart: () => "c1",
    updateSmartFilter: () => {},
    attachFile: () => {},
    detachFile: () => {},
    deleteCollection: () => {},
  };
  const tags: V2TagPorts = {
    list: () => [],
    tagsForFile: () => [],
    create: () => "t1",
    attach: () => {},
    detach: () => {},
  };
  const shelfRows = new Map<string, string[]>();
  const shelf: V2ShelfPorts = {
    readIds: (extensionId) => [...(shelfRows.get(extensionId) ?? [])],
    writeIds: (extensionId, ids) => {
      shelfRows.set(extensionId, [...ids]);
    },
  };
  const folders: V2FolderScanPorts = {
    libraryRoots: () => ["/lib"],
    pathIo: () => fakePathIo(["/lib", "/lib/empty"]),
    listDirectory: async () => [],
    removeEmptyDirectory: async () => {},
  };
  return {
    extensionId: "fixture-greeter",
    effectivePermissions: [
      "library:read",
      "library:write",
      "collections:read",
      "collections:write",
      "tags:read",
      "tags:write",
      "files:read",
      "files:delete",
    ],
    library,
    mutations,
    collections,
    tags,
    shelf,
    folders,
    sources: new V2SourceGrantStore(() => "2026-09-06T00:00:00.000Z"),
    ...overrides,
  };
}

describe("createV2ExtendedOperations", () => {
  it("exposes every gap group alongside the base services", () => {
    const services = createV2ExtendedOperations(extendedArgs());
    expect(Object.keys(services).sort()).toEqual(
      ["collections", "folders", "libraryMutations", "shelf", "tags"],
    );
    expect(services.shelf.add(["a"])).toEqual({ added: 1, total: 1 });
    expect(services.shelf.list()).toEqual({ ids: ["a"], repaired: [] });
    expect(services.collections.createSmart("Night", "night")).toEqual({ id: "c1" });
    expect(services.tags.create("field")).toEqual({ id: "t1" });
    expect(services.libraryMutations.markRemoved(["a", "gone"])).toEqual({
      marked: ["a"],
      unknownIds: ["gone"],
    });
  });

  it("denies every extended group when the effective set is empty", () => {
    const services = createV2ExtendedOperations(
      extendedArgs({ effectivePermissions: [] }),
    );
    expect(() => services.libraryMutations.markRemoved(["a"])).toThrowError(/"library:write"/);
    expect(() => services.collections.list()).toThrowError(/"collections:read"/);
    expect(() => services.tags.list()).toThrowError(/"tags:read"/);
    expect(() => services.shelf.list()).toThrowError(/"library:read"/);
    return expect(services.folders.listFolder({ path: "/lib" })).rejects.toThrowError(
      /"files:read"/,
    );
  });

  it("denies all groups closed without ports", () => {
    const denied: V2ExtendedOperationServices = denyAllV2ExtendedOperations("fixture-greeter");
    expect(() => denied.libraryMutations.markRemoved(["a"])).toThrowError(V2OperationError);
    expect(() => denied.collections.list()).toThrowError(V2OperationError);
    expect(() => denied.tags.list()).toThrowError(V2OperationError);
    expect(() => denied.shelf.list()).toThrowError(V2OperationError);
    expect(Object.keys(denied)).toEqual(
      expect.arrayContaining(["library", "libraryMutations", "collections", "tags", "shelf", "folders"]),
    );
  });
});

describe("v2 extended host wiring", () => {
  function hostWithExtended(granted: string[]) {
    const registry = new ExtensionV2Registry();
    registry.register(createGreeterFixtureDefinition());
    const args = extendedArgs({ effectivePermissions: granted });
    const host = new ExtensionV2Host({
      registry,
      isEnabled: () => true,
      capabilities: new Set<string>(),
      grantedPermissions: () => granted,
      ports: libraryPorts([record("a"), record("b")]),
      createOperations: (binding) => ({
        ...createV2OperationServices({
          extensionId: binding.extensionId,
          invocationId: binding.invocationId,
          effectivePermissions: binding.effectivePermissions,
          grants: new V2GrantStore(),
          library: args.library,
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
          library: args.library,
          mutations: args.mutations,
          collections: args.collections,
          tags: args.tags,
          shelf: args.shelf,
          folders: args.folders,
          sources: args.sources,
        }),
      }),
    });
    return host;
  }

  it("hands handlers extended services bound to the same effective set as preflight", async () => {
    const host = hostWithExtended(["library:read"]);
    host.registerHandler("fixture-greeter", "fixture-greeter.greet", (context) => {
      const extended = context.operations as unknown as V2ExtendedOperationServices;
      expect(extended.shelf.add(["a"])).toEqual({ added: 1, total: 1 });
      return immediateV2Result({ message: "ok" });
    });
    const result = await host.execute({
      extensionId: "fixture-greeter",
      commandId: "fixture-greeter.greet",
      input: { name: "Ada" },
      selection: { fileIds: ["a"] },
    });
    expect(result.ok).toBe(true);
  });

  it("confines an extended handler that omits its own permission check", async () => {
    const host = hostWithExtended(["library:read"]);
    host.registerHandler("fixture-greeter", "fixture-greeter.greet", (context) => {
      const extended = context.operations as unknown as V2ExtendedOperationServices;
      // No permission check here; the service must still deny.
      extended.libraryMutations.markRemoved(["a"]);
      return immediateV2Result({ message: "unreachable" });
    });
    const result = await host.execute({
      extensionId: "fixture-greeter",
      commandId: "fixture-greeter.greet",
      input: { name: "Ada" },
      selection: { fileIds: ["a"] },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("permission-denied");
      expect(result.message).toMatch(/"library:write"/);
    }
  });
});
