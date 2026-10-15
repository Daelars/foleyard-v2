import { describe, expect, it } from "vitest";

import type { IndexedAudioFile } from "../domain/audio-file";
import {
  assertNoV2Secrets,
  createGreeterFixtureDefinition,
  createV2OperationServices,
  denyAllV2Operations,
  ExtensionV2Host,
  ExtensionV2Registry,
  immediateV2Result,
  V2GrantStore,
  V2OperationError,
  V2OutputConflictError,
  V2WorkflowStateStore,
  type V2ArchivePorts,
  type V2ExtensionStatePorts,
  type V2FileContentPorts,
  type V2LibraryReadPorts,
  type V2NamedSelectionSource,
  type V2OperationFactoryArgs,
  type V2SettingsPorts,
} from "./index";
import { memoryOutputPorts, type MemoryV2Outputs } from "./test-helpers";
import { fakePathIo } from "./test-helpers";
import { audioFile, libraryPorts } from "./test-helpers";

// Area: extension v2 R3 (#167). Narrow semantic services: every method
// enforces the invocation's effective permissions first, then
// authorizes the actual operation (readable roots, destination
// grants, job-owned outputs). Handlers that skip their own checks
// still cannot read or write.

function record(id: string, path = `/lib/${id}.mp3`): IndexedAudioFile {
  return audioFile(id, { path, filename: `${id}.mp3` });
}

function libraryFake(files: IndexedAudioFile[]): V2LibraryReadPorts {
  const base = libraryPorts(files);
  return {
    ...base,
    listPage: (cursor, limit) => {
      const offset = cursor ? Number.parseInt(cursor, 10) : 0;
      const page = files.slice(offset, offset + limit);
      const next = offset + page.length;
      return {
        files: page,
        nextCursor: next < files.length ? String(next) : null,
      };
    },
  };
}

function fileFake(opts: {
  roots?: string[];
  dirs?: string[];
  links?: Record<string, string>;
  initialText?: Record<string, string>;
} = {}): MemoryV2Outputs {
  // Exclusive creation and version-checked cleanup are the port
  // contract; the shared fake models both (see `memoryOutputPorts`).
  return memoryOutputPorts(opts);
}

function memorySettings(): V2SettingsPorts {
  const store = new Map<string, unknown>();
  return {
    readRaw: (key) => store.get(key),
    writeRaw: (key, value) => {
      store.set(key, value);
    },
  };
}

function memoryState(): V2ExtensionStatePorts {
  const store = new Map<string, Record<string, unknown>>();
  return {
    readAll: (extensionId) => store.get(extensionId) ?? {},
    writeAll: (extensionId, state) => {
      store.set(extensionId, state);
    },
  };
}

function archiveFake(): V2ArchivePorts & { calls: Array<{ entries: number; dest: string }> } {
  const calls: Array<{ entries: number; dest: string }> = [];
  const claimed = new Set<string>();
  return {
    calls,
    createZipArchive: async (entries, dest) => {
      if (claimed.has(dest)) throw new V2OutputConflictError(dest);
      claimed.add(dest);
      calls.push({ entries: entries.length, dest });
      return { bytesWritten: entries.length, version: { device: "memory", fileId: `zip:${dest}` } };
    },
  };
}

function servicesArgs(
  overrides?: Partial<V2OperationFactoryArgs>,
): V2OperationFactoryArgs {
  const files = [record("a"), record("b")];
  return {
    extensionId: "fixture-greeter",
    invocationId: "vinv_test",
    effectivePermissions: ["library:read", "files:read", "files:copy", "files:write", "settings:read", "settings:write"],
    grants: new V2GrantStore(() => "2026-09-06T00:00:00.000Z"),
    library: libraryFake(files),
    files: fileFake({ initialText: { "/lib/a.mp3": "audio-a", "/lib/b.mp3": "audio-b" } }).ports,
    archive: archiveFake(),
    settings: memorySettings(),
    extensionState: memoryState(),
    selectionSources: [],
    ...overrides,
  };
}

describe("createV2OperationServices permission confinement", () => {
  it("denies every privileged method when the effective set is empty", async () => {
    const services = createV2OperationServices(servicesArgs({ effectivePermissions: [] }));
    expect(() => services.library.getFile("a")).toThrowError(V2OperationError);
    expect(() => services.library.getFile("a")).toThrowError(/"library:read"/);
    await expect(services.files.readFile("a")).rejects.toThrowError(/"files:read"/);
    await expect(services.files.copyToOutput("a", "out.mp3", "grant")).rejects.toThrowError(
      /"files:copy"/,
    );
    await expect(services.files.createOutputText("grant", "out.txt", "x")).rejects.toThrowError(
      /"files:write"/,
    );
    await expect(services.archive.createZip("grant", "out.zip", ["a"])).rejects.toThrowError(
      /permission/,
    );
    expect(() => services.settings.get("fixture-greeter.formality")).toThrowError(
      /"settings:read"/,
    );
    // State is namespaced but permission-free; jobs only touch this invocation.
    services.state.write("draft", { step: 1 });
    expect(services.state.read("draft")).toEqual({ step: 1 });
    expect(() => services.jobs.reportProgress(1, 2)).not.toThrow();
  });

  it("enforces read permissions alongside mutations", async () => {
    const readOnly = createV2OperationServices(
      servicesArgs({ effectivePermissions: ["library:read"] }),
    );
    expect(readOnly.library.getFile("a")!.id).toBe("a");
    await expect(readOnly.files.readFile("a")).rejects.toThrowError(/"files:read"/);
    await expect(readOnly.files.copyToOutput("a", "o.mp3", "g")).rejects.toThrowError(
      /"files:copy"/,
    );
  });
});

describe("v2 file operations and grants", () => {
  function grantedSetup() {
    const grants = new V2GrantStore(() => "2026-09-06T00:00:00.000Z");
    const grant = grants.issue("fixture-greeter", "/grant");
    const { ports } = fileFake({
      roots: ["/lib"],
      dirs: ["/grant"],
      initialText: { "/lib/a.mp3": "audio-a" },
    });
    return { grants, grant, ports };
  }

  it("reads and copies through authorized paths", async () => {
    const { grants, grant, ports } = grantedSetup();
    const services = createV2OperationServices(
      servicesArgs({ grants, files: ports, library: libraryFake([record("a")]) }),
    );
    expect(new TextDecoder().decode(await services.files.readFile("a"))).toBe("audio-a");
    const copied = await services.files.copyToOutput("a", "a-copy.mp3", grant.grantId);
    expect(copied.path).toBe("/grant/a-copy.mp3");
    expect(services.workspace.ownedPaths()).toEqual(["/grant/a-copy.mp3"]);
  });

  it("denies expired, foreign, and missing grants", async () => {
    const { ports } = grantedSetup();
    const grants = new V2GrantStore(() => "2026-09-06T02:00:00.000Z");
    const expired = grants.issue("fixture-greeter", "/grant", {
      expiresAt: "2026-09-06T01:00:00.000Z",
    });
    const foreign = grants.issue("make-pack-v2", "/grant");
    const services = createV2OperationServices(
      servicesArgs({ grants, files: ports, library: libraryFake([record("a")]) }),
    );
    await expect(services.files.copyToOutput("a", "o.mp3", expired.grantId)).rejects.toThrowError(
      /expired/,
    );
    await expect(services.files.copyToOutput("a", "o.mp3", foreign.grantId)).rejects.toThrowError(
      /another extension/,
    );
    await expect(services.files.copyToOutput("a", "o.mp3", "nope")).rejects.toThrowError(
      /unknown or was revoked/,
    );
  });

  it("denies traversal and junction escapes on output", async () => {
    const grants = new V2GrantStore(() => "2026-09-06T00:00:00.000Z");
    const grant = grants.issue("fixture-greeter", "/grant");
    const { ports } = fileFake({
      roots: ["/lib"],
      dirs: ["/grant", "/outside"],
      links: { "/grant/link": "/outside" },
      initialText: { "/lib/a.mp3": "audio-a" },
    });
    const services = createV2OperationServices(
      servicesArgs({ grants, files: ports, library: libraryFake([record("a")]) }),
    );
    await expect(services.files.copyToOutput("a", "../evil.mp3", grant.grantId)).rejects.toThrowError(
      V2OperationError,
    );
    // Output names are single file names, so a link under the grant
    // root is unreachable by name; ancestor-junction redirection is
    // covered at the filesystem-guard level (filesystem.test.ts).
    await expect(
      services.files.createOutputText(grant.grantId, "link/evil.txt", "x"),
    ).rejects.toThrowError(/single file name/);
  });

  it("never overwrites existing destination files", async () => {
    const grants = new V2GrantStore(() => "2026-09-06T00:00:00.000Z");
    const grant = grants.issue("fixture-greeter", "/grant");
    const { ports, bytes } = fileFake({
      roots: ["/lib"],
      dirs: ["/grant"],
      initialText: { "/lib/a.mp3": "audio-a", "/grant/taken.mp3": "precious" },
    });
    const services = createV2OperationServices(
      servicesArgs({ grants, files: ports, library: libraryFake([record("a")]) }),
    );
    await expect(services.files.copyToOutput("a", "taken.mp3", grant.grantId)).rejects.toThrowError(
      /never overwritten/,
    );
    expect(new TextDecoder().decode(bytes.get("/grant/taken.mp3")!)).toBe("precious");
    expect(services.workspace.ownedPaths()).toEqual([]);
  });

  it("cleans up only job-owned resources", async () => {
    const grants = new V2GrantStore(() => "2026-09-06T00:00:00.000Z");
    const grant = grants.issue("fixture-greeter", "/grant");
    const { ports, bytes } = fileFake({
      roots: ["/lib"],
      dirs: ["/grant"],
      initialText: { "/lib/a.mp3": "audio-a", "/grant/unrelated.txt": "keep me" },
    });
    const services = createV2OperationServices(
      servicesArgs({ grants, files: ports, library: libraryFake([record("a")]) }),
    );
    await services.files.copyToOutput("a", "owned.mp3", grant.grantId);
    const disposed = await services.workspace.dispose();
    expect(disposed.removed).toEqual(["/grant/owned.mp3"]);
    expect(bytes.has("/grant/owned.mp3")).toBe(false);
    expect(new TextDecoder().decode(bytes.get("/grant/unrelated.txt")!)).toBe("keep me");
    expect(services.workspace.ownedPaths()).toEqual([]);
  });

  it("does not delete a replacement at a previously owned path", async () => {
    const grants = new V2GrantStore(() => "2026-09-06T00:00:00.000Z");
    const grant = grants.issue("fixture-greeter", "/grant");
    const { ports, bytes, replace } = fileFake({
      roots: ["/lib"],
      dirs: ["/grant"],
      initialText: { "/lib/a.mp3": "audio-a" },
    });
    const services = createV2OperationServices(
      servicesArgs({ grants, files: ports, library: libraryFake([record("a")]) }),
    );
    await services.files.copyToOutput("a", "owned.mp3", grant.grantId);
    // The job's output is gone; a different file now sits at that path.
    replace("/grant/owned.mp3", "third-party replacement");

    const disposed = await services.workspace.dispose();

    expect(disposed.removed).toEqual([]);
    expect(new TextDecoder().decode(bytes.get("/grant/owned.mp3")!)).toBe("third-party replacement");
    expect(services.workspace.ownedPaths()).toEqual([]);
  });

  it("lets only one of two concurrent jobs claim a destination", async () => {
    const grants = new V2GrantStore(() => "2026-09-06T00:00:00.000Z");
    const grant = grants.issue("fixture-greeter", "/grant");
    const { ports } = fileFake({
      roots: ["/lib"],
      dirs: ["/grant"],
      initialText: { "/lib/a.mp3": "audio-a" },
    });
    const first = createV2OperationServices(
      servicesArgs({
        grants,
        files: ports,
        library: libraryFake([record("a")]),
        invocationId: "vinv_first",
      }),
    );
    const second = createV2OperationServices(
      servicesArgs({
        grants,
        files: ports,
        library: libraryFake([record("a")]),
        invocationId: "vinv_second",
      }),
    );

    const settled = await Promise.allSettled([
      first.files.copyToOutput("a", "same.mp3", grant.grantId),
      second.files.copyToOutput("a", "same.mp3", grant.grantId),
    ]);

    expect(settled.filter((entry) => entry.status === "fulfilled")).toHaveLength(1);
    const rejected = settled.filter((entry) => entry.status === "rejected");
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(V2OperationError);
    expect(String((rejected[0] as PromiseRejectedResult).reason)).toMatch(/already exists/i);
  });

  it("lets only one of two concurrent jobs claim a destination (text)", async () => {
    const grants = new V2GrantStore(() => "2026-09-06T00:00:00.000Z");
    const grant = grants.issue("fixture-greeter", "/grant");
    const { ports } = fileFake({ roots: ["/lib"], dirs: ["/grant"] });
    const first = createV2OperationServices(
      servicesArgs({ grants, files: ports, invocationId: "vinv_first" }),
    );
    const second = createV2OperationServices(
      servicesArgs({ grants, files: ports, invocationId: "vinv_second" }),
    );

    const settled = await Promise.allSettled([
      first.files.createOutputText(grant.grantId, "same.txt", "first"),
      second.files.createOutputText(grant.grantId, "same.txt", "second"),
    ]);

    expect(settled.filter((entry) => entry.status === "fulfilled")).toHaveLength(1);
    const rejected = settled.filter((entry) => entry.status === "rejected");
    expect(rejected).toHaveLength(1);
    expect(String((rejected[0] as PromiseRejectedResult).reason)).toMatch(/already exists/i);
    expect(first.workspace.ownedPaths().length + second.workspace.ownedPaths().length).toBe(1);
  });

  it("lets only one of two concurrent jobs claim a destination (ZIP)", async () => {
    const grants = new V2GrantStore(() => "2026-09-06T00:00:00.000Z");
    const grant = grants.issue("fixture-greeter", "/grant");
    const { ports } = fileFake({
      roots: ["/lib"],
      dirs: ["/grant"],
      initialText: { "/lib/a.mp3": "audio-a" },
    });
    const archive = archiveFake();
    const first = createV2OperationServices(
      servicesArgs({ grants, files: ports, archive, invocationId: "vinv_first" }),
    );
    const second = createV2OperationServices(
      servicesArgs({ grants, files: ports, archive, invocationId: "vinv_second" }),
    );

    const settled = await Promise.allSettled([
      first.archive.createZip(grant.grantId, "same.zip", ["a"]),
      second.archive.createZip(grant.grantId, "same.zip", ["a"]),
    ]);

    expect(settled.filter((entry) => entry.status === "fulfilled")).toHaveLength(1);
    const rejected = settled.filter((entry) => entry.status === "rejected");
    expect(rejected).toHaveLength(1);
    expect(String((rejected[0] as PromiseRejectedResult).reason)).toMatch(/already exists/i);
    expect(archive.calls).toHaveLength(1);
  });
});

describe("v2 named selection sources", () => {
  function sources(): V2NamedSelectionSource[] {
    return [
      { name: "shelf", requiredPermission: "library:read", listIds: () => ["a"] },
      { name: "recent", requiredPermission: "library:read", listIds: async () => ["b"] },
    ];
  }

  it("resolves named sources through authorized Library records", async () => {
    const services = createV2OperationServices(
      servicesArgs({ selectionSources: sources() }),
    );
    expect(services.selection.sourceNames()).toEqual(["shelf", "recent"]);
    expect((await services.selection.resolveSource("shelf")).map((file) => file.id)).toEqual([
      "a",
    ]);
    expect((await services.selection.resolveSource("recent")).map((file) => file.id)).toEqual([
      "b",
    ]);
  });

  it("denies sources without their required permission and unknown names", async () => {
    const services = createV2OperationServices(
      servicesArgs({ selectionSources: sources(), effectivePermissions: ["files:read"] }),
    );
    await expect(services.selection.resolveSource("shelf")).rejects.toThrowError(
      /"library:read"/,
    );
    await expect(services.selection.resolveSource("nope")).rejects.toThrowError(/unknown/);
  });

  it("reports source entries missing from the index", async () => {
    const services = createV2OperationServices(
      servicesArgs({
        selectionSources: [{ name: "stale", requiredPermission: "library:read", listIds: () => ["gone"] }],
      }),
    );
    await expect(services.selection.resolveSource("stale")).rejects.toThrowError(/outside the Library index/);
  });
});

describe("v2 settings and state", () => {
  it("namespaces settings to the owning extension", () => {
    const services = createV2OperationServices(servicesArgs());
    services.settings.set("fixture-greeter.formality", "formal");
    expect(services.settings.get("fixture-greeter.formality")).toBe("formal");
    expect(() => services.settings.get("other-ext.key")).toThrowError(/own namespace/);
    expect(() => services.settings.set("other-ext.key", 1)).toThrowError(/own namespace/);
  });

  it("resets every declared setting under its canonical namespaced identifier", () => {
    // Registry validation requires declared setting IDs to carry the
    // extension prefix (`fixture-greeter.formality`), so reset-all must
    // write `extension:fixture-greeter:setting:fixture-greeter.formality`
    // — never a second prefix.
    const rows = new Map<string, unknown>();
    const settings: V2SettingsPorts = {
      readRaw: (key) => rows.get(key),
      writeRaw: (key, value) => {
        rows.set(key, value);
      },
    };
    const declarations = [
      {
        id: "fixture-greeter.formality",
        label: "Formality",
        type: "enum" as const,
        defaultValue: "casual",
        options: [
          { label: "Casual", value: "casual" },
          { label: "Formal", value: "formal" },
        ],
      },
      {
        id: "fixture-greeter.verbose",
        label: "Verbose",
        type: "boolean" as const,
        defaultValue: false,
      },
    ];
    const services = createV2OperationServices(
      servicesArgs({ settings, settingsDeclarations: declarations }),
    );

    services.settings.set("fixture-greeter.formality", "formal");
    services.settings.set("fixture-greeter.verbose", true);
    services.settings.reset();

    expect(rows.get("extension:fixture-greeter:setting:fixture-greeter.formality")).toBe("casual");
    expect(rows.get("extension:fixture-greeter:setting:fixture-greeter.verbose")).toBe(false);
    expect([...rows.keys()].filter((key) => key.includes("fixture-greeter.fixture-greeter"))).toEqual([]);
    // The reset round-trips: reads observe the restored defaults.
    expect(services.settings.get("fixture-greeter.formality")).toBe("casual");
    expect(services.settings.get("fixture-greeter.verbose")).toBe(false);
  });

  it("persists workflow state through the versioned, bounded envelope", () => {
    const blobs = new Map<string, Record<string, unknown>>();
    const extensionState: V2ExtensionStatePorts = {
      readAll: (extensionId) => blobs.get(extensionId) ?? {},
      writeAll: (extensionId, state) => {
        blobs.set(extensionId, state);
      },
    };
    const services = createV2OperationServices(servicesArgs({ extensionState }));

    services.state.write("draft", { step: 1 });
    expect(blobs.get("fixture-greeter")).toMatchObject({
      __v2envelope: true,
      schemaVersion: 0,
      data: { draft: { step: 1 } },
    });
    expect(() => services.state.write("k".repeat(300), 1)).toThrowError(/State key/);
    expect(JSON.parse(JSON.stringify(blobs.get("fixture-greeter"))).data).toEqual({
      draft: { step: 1 },
    });
  });

  it("serializes concurrent read-modify-write updates from two invocations", async () => {
    const blobs = new Map<string, Record<string, unknown>>();
    const extensionState: V2ExtensionStatePorts = {
      readAll: (extensionId) => blobs.get(extensionId) ?? {},
      writeAll: (extensionId, state) => {
        blobs.set(extensionId, state);
      },
    };
    // One process-wide store per extension: two job-bound invocation
    // services share it, so their read-modify-write operations serialize.
    const store = new V2WorkflowStateStore("fixture-greeter", extensionState);
    const first = createV2OperationServices(
      servicesArgs({ extensionId: "fixture-greeter", extensionState, workflowState: store }),
    );
    const second = createV2OperationServices(
      servicesArgs({ extensionId: "fixture-greeter", extensionState, workflowState: store }),
    );

    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let firstRan = false;
    const firstUpdate = first.state.update("history", async (current) => {
      firstRan = true;
      await held;
      return [...(Array.isArray(current) ? current : []), "first"];
    });
    while (!firstRan) await Promise.resolve();
    const secondUpdate = second.state.update("history", async (current) => [
      ...(Array.isArray(current) ? current : []),
      "second",
    ]);
    release();
    await Promise.all([firstUpdate, secondUpdate]);

    expect(store.read("history")).toEqual(["first", "second"]);
  });

  it("keeps extension state isolated between extensions", () => {
    const extensionState = memoryState();
    const first = createV2OperationServices(servicesArgs({ extensionId: "ext-one", extensionState }));
    const second = createV2OperationServices(servicesArgs({ extensionId: "ext-two", extensionState }));
    first.state.write("draft", { step: 1 });
    expect(second.state.read("draft")).toBeUndefined();
    second.state.write("draft", { step: 2 });
    expect(first.state.read("draft")).toEqual({ step: 1 });
    first.state.remove("draft");
    expect(first.state.read("draft")).toBeUndefined();
  });

  it("rejects non-serializable settings and state", () => {
    const services = createV2OperationServices(servicesArgs());
    expect(() => services.settings.set("fixture-greeter.bad", () => 1)).toThrowError(
      /serializable/,
    );
    expect(() => services.state.write("bad", () => 1)).toThrowError(/serializable/);
  });
});

describe("v2 archive output", () => {
  function archiveSetup() {
    const grants = new V2GrantStore(() => "2026-09-06T00:00:00.000Z");
    const grant = grants.issue("fixture-greeter", "/grant");
    const { ports } = fileFake({
      roots: ["/lib"],
      dirs: ["/grant"],
      initialText: { "/lib/a.mp3": "audio-a", "/lib/b.mp3": "audio-b" },
    });
    const archive = archiveFake();
    const services = createV2OperationServices(
      servicesArgs({
        grants,
        files: ports,
        archive,
        library: libraryFake([record("a"), record("b")]),
      }),
    );
    return { services, archive, grant };
  }

  it("archives authorized sources into a grant-owned ZIP", async () => {
    const { services, archive, grant } = archiveSetup();
    const result = await services.archive.createZip(grant.grantId, "pack.zip", ["a", "b"]);
    expect(result).toEqual({ path: "/grant/pack.zip", entries: 2 });
    expect(archive.calls).toEqual([{ entries: 2, dest: "/grant/pack.zip" }]);
    expect(services.workspace.ownedPaths()).toEqual(["/grant/pack.zip"]);
  });

  it("rejects a second archive at the same name instead of overwriting it", async () => {
    const { services, archive, grant } = archiveSetup();
    await services.archive.createZip(grant.grantId, "pack.zip", ["a", "b"]);
    await expect(
      services.archive.createZip(grant.grantId, "pack.zip", ["a", "b"]),
    ).rejects.toThrowError(/already exists/i);
    expect(archive.calls).toHaveLength(1);
    expect(services.workspace.ownedPaths()).toEqual(["/grant/pack.zip"]);
  });

  it("forwards the manifest as an in-memory entry, never a temp file", async () => {
    const calls: Array<{ entries: unknown[]; dest: string }> = [];
    const grants = new V2GrantStore(() => "2026-09-06T00:00:00.000Z");
    const grant = grants.issue("fixture-greeter", "/grant");
    const { ports } = fileFake({
      roots: ["/lib"],
      dirs: ["/grant"],
      initialText: { "/lib/a.mp3": "audio-a" },
    });
    const services = createV2OperationServices(
      servicesArgs({
        grants,
        files: ports,
        archive: {
          createZipArchive: async (entries, dest) => {
            calls.push({ entries: [...entries], dest });
            return { bytesWritten: entries.length, version: { device: "memory", fileId: dest } };
          },
        },
        library: libraryFake([record("a")]),
      }),
    );
    await services.archive.createZip(grant.grantId, "pack.zip", ["a"], {
      manifestText: '{"name":"pack"}',
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.dest).toBe("/grant/pack.zip");
    expect(calls[0]?.entries).toEqual([
      { name: "a.mp3", sourcePath: "/lib/a.mp3" },
      { name: "manifest.json", text: '{"name":"pack"}' },
    ]);
  });

  it("reserves manifest.json and rejects collisions, limits, and bad names", async () => {
    const grants = new V2GrantStore(() => "2026-09-06T00:00:00.000Z");
    const grant = grants.issue("fixture-greeter", "/grant");
    const manifestRecord = { ...record("m", "/lib/manifest.json"), filename: "manifest.json" };
    const { ports } = fileFake({
      roots: ["/lib"],
      dirs: ["/grant"],
      initialText: { "/lib/manifest.json": "{}", "/lib/a.mp3": "audio-a" },
    });
    const manifestServices = createV2OperationServices(
      servicesArgs({
        grants,
        files: ports,
        library: libraryFake([record("a"), manifestRecord]),
      }),
    );
    await expect(
      manifestServices.archive.createZip(grant.grantId, "pack.zip", ["m"], { manifestText: "{}" }),
    ).rejects.toThrowError(/never overwritten/);

    const { services } = archiveSetup();
    await expect(services.archive.createZip(grant.grantId, "pack.tar", ["a"])).rejects.toThrowError(
      /\.zip/,
    );
    await expect(
      services.archive.createZip(grant.grantId, "pack.zip", Array.from({ length: 501 }, (_, i) => `f-${i}`)),
    ).rejects.toThrowError(/limit is 500/);

    const collidingGrants = new V2GrantStore(() => "2026-09-06T00:00:00.000Z");
    const collidingGrant = collidingGrants.issue("fixture-greeter", "/grant");
    const collidingFiles = fileFake({
      roots: ["/lib"],
      dirs: ["/grant"],
      initialText: { "/lib/c1.mp3": "one", "/lib/c2.mp3": "two" },
    });
    const colliding = createV2OperationServices(
      servicesArgs({
        grants: collidingGrants,
        files: collidingFiles.ports,
        library: libraryFake([
          { ...record("c1", "/lib/c1.mp3"), filename: "same.mp3" },
          { ...record("c2", "/lib/c2.mp3"), filename: "SAME.mp3" },
        ]),
      }),
    );
    await expect(
      colliding.archive.createZip(collidingGrant.grantId, "pack.zip", ["c1", "c2"]),
    ).rejects.toThrowError(/collides/);
  });

  it("requires both files:read and files:write", async () => {
    const readOnly = createV2OperationServices(
      servicesArgs({ effectivePermissions: ["library:read", "files:read"] }),
    );
    await expect(readOnly.archive.createZip("g", "p.zip", ["a"])).rejects.toThrowError(
      /"files:write"/,
    );
    const writeOnly = createV2OperationServices(
      servicesArgs({ effectivePermissions: ["library:read", "files:write"] }),
    );
    await expect(writeOnly.archive.createZip("g", "p.zip", ["a"])).rejects.toThrowError(
      /"files:read"/,
    );
  });
});

describe("v2 host operation wiring", () => {
  function hostWithOperations(granted: string[]) {
    const registry = new ExtensionV2Registry();
    registry.register(createGreeterFixtureDefinition());
    const grants = new V2GrantStore(() => "2026-09-06T00:00:00.000Z");
    const { ports } = fileFake({
      initialText: { "/lib/a.mp3": "audio-a", "/lib/b.mp3": "audio-b" },
    });
    const host = new ExtensionV2Host({
      registry,
      isEnabled: () => true,
      capabilities: new Set<string>(),
      grantedPermissions: () => granted,
      ports: libraryPorts([record("a"), record("b")]),
      createOperations: (binding) =>
        createV2OperationServices({
          extensionId: binding.extensionId,
          invocationId: binding.invocationId,
          effectivePermissions: binding.effectivePermissions,
          grants,
          library: libraryFake([record("a"), record("b")]),
          files: ports,
          archive: archiveFake(),
          settings: memorySettings(),
          extensionState: memoryState(),
        }),
    });
    return host;
  }

  it("hands handlers services bound to the same effective set as preflight", async () => {
    const host = hostWithOperations(["library:read", "files:read"]);
    host.registerHandler("fixture-greeter", "fixture-greeter.greet", (context) => {
      expect(context.permissions).toEqual(["library:read"]);
      expect(context.operations.library.getFile("a")!.id).toBe("a");
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

  it("confines a handler that omits its own permission check", async () => {
    const host = hostWithOperations(["library:read"]);
    host.registerHandler("fixture-greeter", "fixture-greeter.greet", async (context) => {
      // No permission check here; the service must still deny.
      await context.operations.files.readFile("a");
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
      expect(result.message).toMatch(/"files:read"/);
    }
  });

  it("denies every service by default when the host has no factory", async () => {
    const registry = new ExtensionV2Registry();
    registry.register(createGreeterFixtureDefinition());
    const host = new ExtensionV2Host({
      registry,
      isEnabled: () => true,
      capabilities: new Set<string>(),
      grantedPermissions: () => ["library:read"],
      ports: libraryPorts([record("a")]),
    });
    host.registerHandler("fixture-greeter", "fixture-greeter.greet", (context) => {
      expect(() => context.operations.library.getFile("a")).toThrowError(V2OperationError);
      return immediateV2Result({ message: "ok" });
    });
    const result = await host.execute({
      extensionId: "fixture-greeter",
      commandId: "fixture-greeter.greet",
      input: { name: "Ada" },
      selection: { fileIds: ["a"] },
    });
    expect(result.ok).toBe(true);
    expect(denyAllV2Operations("x").workspace.ownedPaths()).toEqual([]);
  });

  it("carries no secret keys on the handler operation surface", () => {
    const services = createV2OperationServices(servicesArgs());
    expect(Object.keys(services)).toEqual(
      expect.arrayContaining(["library", "selection", "files", "archive", "settings", "state", "jobs", "workspace"]),
    );
    assertNoV2Secrets(
      { surface: Object.keys(services), owned: services.workspace.ownedPaths() },
      "v2 operation surface",
    );
  });
});
