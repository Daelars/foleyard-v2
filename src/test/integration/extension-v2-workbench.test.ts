import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createV2OperationServices,
  ExtensionV2Host,
  ExtensionV2Registry,
  V2GrantStore,
  type IndexedAudioFile,
  type V2ArchivePorts,
  type V2ExecutionResult,
  type V2ExtensionStatePorts,
  type V2FileContentPorts,
  type V2HostServices,
  type V2LibraryReadPorts,
  type V2SettingsPorts,
} from "@yard-core";

// Area: extension v2 R9 (#172). Fixture handlers execute through the
// real host with observable behavior (runMode echoed, denial named,
// isolated state); dev reload is idempotent with disposal; production
// code carries no fixture-ID branches and packaged builds exclude the
// workbench. Heavy persistence leaves are mocked in-memory; registry,
// host, availability, and redaction behavior stay real.

vi.mock("@/lib/db", () => ({
  getLibraryRoots: () => [],
  getFileById: () => null,
  getFilesByIds: () => [],
  getFiles: () => ({ files: [], nextCursor: null }),
  getAllCollections: () => [],
}));

vi.mock("@/lib/extensions-v2/jobs", () => ({
  getV2JobManager: () => ({ cancelExtensionJobs: vi.fn() }),
  ensureV2JobsRestored: () => ({ restored: 0, interrupted: 0 }),
}));

vi.mock("@/lib/extensions-v2/settings-state", () => {
  const rows = new Map<string, unknown>();
  return {
    readV2SettingsRow: (key: string) => rows.get(key),
    writeV2SettingsRow: (key: string, value: unknown) => {
      rows.set(key, value);
    },
    createV2SettingsPorts: () => ({
      readRaw: (key: string) => rows.get(key),
      writeRaw: (key: string, value: unknown) => {
        rows.set(key, value);
      },
    }),
    createV2ExtensionStatePorts: () => ({
      readAll: () => ({}),
      writeAll: () => {},
    }),
  };
});

import {
  createSurfaceFixtureDefinition,
  createWorkerFixtureDefinition,
  devFixturesEnabled,
  registerV2DevFixtures,
} from "@/lib/extensions-v2/fixtures";
import {
  buildAppV2Catalog,
  getV2Registry,
  unregisterV2Extension,
} from "@/lib/extensions-v2/host";
import {
  ensureV2DevFixtureHandlers,
  registerFixtureSurfaceHandlers,
  registerFixtureWorkerHandlers,
} from "@/app/prototype/ext-v2-workbench/fixture-handlers";

function record(id: string): IndexedAudioFile {
  return {
    id,
    path: `/library/${id}.mp3`,
    filename: `${id}.mp3`,
    libraryRoot: "/library",
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

const FILES = [record("a"), record("b"), record("c")];
const GRANTED = ["library:read", "files:read", "drop:read", "settings:read", "settings:write"];

function servicesArgs(
  registry: ExtensionV2Registry,
  state: V2ExtensionStatePorts,
): V2HostServices {
  const byId = new Map(FILES.map((file) => [file.id, file]));
  const library: V2LibraryReadPorts = {
    getFileById: (id) => byId.get(id) ?? null,
    getFilesByIds: (ids) => ids.flatMap((id) => (byId.get(id) ? [byId.get(id)!] : [])),
    collectionExists: () => true,
    listPage: (cursor, limit) => {
      const offset = cursor ? Number.parseInt(cursor, 10) : 0;
      const page = FILES.slice(offset, offset + limit);
      const next = offset + page.length;
      return { files: page, nextCursor: next < FILES.length ? String(next) : null };
    },
  };
  const settingsStore = new Map<string, unknown>([["fixture-worker.batch-size", 2]]);
  const settings: V2SettingsPorts = {
    readRaw: (key) => settingsStore.get(key),
    writeRaw: (key, value) => {
      settingsStore.set(key, value);
    },
  };
  const unusedFiles: V2FileContentPorts = {
    readFileBytes: async () => {
      throw new Error("unused in this test");
    },
    copyFile: async () => {
      throw new Error("unused in this test");
    },
    writeFileBytes: async () => {
      throw new Error("unused in this test");
    },
    deleteFile: async () => {
      throw new Error("unused in this test");
    },
    exists: async () => false,
    libraryRoots: () => [],
    pathIo: () => ({
      realpath: async () => {
        throw new Error("unused in this test");
      },
      lstat: async () => {
        throw new Error("unused in this test");
      },
    }),
  };
  const archive: V2ArchivePorts = {
    createZipArchive: async () => {
      throw new Error("unused in this test");
    },
  };
  return {
    registry,
    isEnabled: () => true,
    capabilities: new Set(["desktop.native"]),
    grantedPermissions: () => GRANTED,
    ports: library,
    createOperations: (binding) =>
      createV2OperationServices({
        extensionId: binding.extensionId,
        invocationId: binding.invocationId,
        effectivePermissions: binding.effectivePermissions,
        grants: new V2GrantStore(),
        library,
        files: unusedFiles,
        archive,
        settings,
        extensionState: state,
        settingsDeclarations: registry.get(binding.extensionId)?.settings,
        ...(binding.reporter ? { jobs: binding.reporter } : {}),
      }),
  };
}

function fixtureHost(state?: V2ExtensionStatePorts): {
  host: ExtensionV2Host;
  state: V2ExtensionStatePorts;
} {
  const store = new Map<string, Record<string, unknown>>();
  const ports: V2ExtensionStatePorts = state ?? {
    readAll: (extensionId) => store.get(extensionId) ?? {},
    writeAll: (extensionId, value) => {
      store.set(extensionId, value);
    },
  };
  const registry = new ExtensionV2Registry();
  registry.register(createSurfaceFixtureDefinition());
  registry.register(createWorkerFixtureDefinition());
  const host = new ExtensionV2Host(servicesArgs(registry, ports));
  registerFixtureSurfaceHandlers(host);
  registerFixtureWorkerHandlers(host);
  return { host, state: ports };
}

function immediateString(result: V2ExecutionResult): string {
  expect(result.ok).toBe(true);
  if (result.ok && result.outcome.kind === "immediate") {
    expect(typeof result.outcome.value).toBe("string");
    return result.outcome.value as string;
  }
  expect.unreachable("expected an immediate string outcome");
}

describe("v2 fixture handlers", () => {
  it("runs surface commands directly and echoes the run mode", async () => {
    const { host } = fixtureHost();
    const ping = await host.execute({
      extensionId: "fixture-surface",
      commandId: "fixture-surface.ping",
      input: { note: "hello" },
      selection: { fileIds: [] },
    });
    expect(immediateString(ping)).toContain("runMode=direct");
    expect(immediateString(ping)).toContain("hello");

    const file = await host.execute({
      extensionId: "fixture-surface",
      commandId: "fixture-surface.inspect-file",
      selection: { fileIds: ["a"] },
    });
    expect(immediateString(file)).toContain("a.mp3");

    const folder = await host.execute({
      extensionId: "fixture-surface",
      commandId: "fixture-surface.inspect-folder",
      selection: { fileIds: [], folderPath: "/library" },
    });
    expect(immediateString(folder)).toContain("/library");

    const collection = await host.execute({
      extensionId: "fixture-surface",
      commandId: "fixture-surface.inspect-collection",
      selection: { fileIds: [], collectionId: "c1" },
    });
    expect(immediateString(collection)).toContain("c1");

    const drop = await host.execute({
      extensionId: "fixture-surface",
      commandId: "fixture-surface.inspect-drop",
      selection: { fileIds: [], dropFileCount: 3 },
    });
    expect(immediateString(drop)).toContain("3 dropped");
  });

  it("runs the worker count as a job with progress, a named denial, and isolated state", async () => {
    const { host, state } = fixtureHost();
    const submitted = await host.submitJob({
      extensionId: "fixture-worker",
      commandId: "fixture-worker.count-library",
      selection: { fileIds: [] },
    });
    expect(submitted.ok).toBe(true);
    const submittedOutcome = submitted.ok ? submitted.outcome : null;
    if (!submittedOutcome || submittedOutcome.kind !== "job") {
      expect.unreachable("expected a job outcome");
    }
    const settled = await (async () => {
      for (let attempt = 0; attempt < 200; attempt += 1) {
        const current = host.jobs.getJob(submittedOutcome.jobId);
        if (current && ["succeeded", "failed", "cancelled", "interrupted"].includes(current.state)) {
          return current;
        }
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      return host.jobs.getJob(submittedOutcome.jobId);
    })();
    const record = settled;
    expect(record?.state).toBe("succeeded");
    expect(record?.progress.completed).toBeGreaterThan(0);
    const value = record?.value as string | undefined;
    expect(typeof value).toBe("string");
    expect(value).toContain("3 record(s)");
    expect(value).toContain("runMode=job");
    expect(value).toContain("denied=files:write");
    expect(state.readAll("fixture-worker")["last-count"]).toBe(3);
  });

  it("keeps worker state invisible to the surface fixture", async () => {
    const store = new Map<string, Record<string, unknown>>();
    const ports: V2ExtensionStatePorts = {
      readAll: (extensionId) => store.get(extensionId) ?? {},
      writeAll: (extensionId, value) => {
        store.set(extensionId, value);
      },
    };
    const { host } = fixtureHost(ports);
    await host.execute({
      extensionId: "fixture-worker",
      commandId: "fixture-worker.count-library",
      selection: { fileIds: [] },
    });
    expect(store.get("fixture-surface")).toBeUndefined();
    expect(store.get("fixture-worker")?.["last-count"]).toBe(3);
  });
});

describe("v2 dev reload and disposal", () => {
  afterEach(() => {
    ensureV2DevFixtureHandlers();
  });

  it("registers handlers once across reloads and never duplicates contributions", () => {
    const first = ensureV2DevFixtureHandlers();
    const before = buildAppV2Catalog().entries.filter((entry) => entry.id.startsWith("fixture-"));
    const second = ensureV2DevFixtureHandlers();
    const after = buildAppV2Catalog().entries.filter((entry) => entry.id.startsWith("fixture-"));
    expect(second.handlers).toEqual([]);
    expect(after.map((entry) => entry.id).sort()).toEqual(
      before.map((entry) => entry.id).sort(),
    );
    expect(first.handlers.length + second.handlers.length).toBeLessThanOrEqual(7);
  });

  it("removes fixture contributions on unregister and restores them on reload", () => {
    ensureV2DevFixtureHandlers();
    expect(getV2Registry().get("fixture-surface")).toBeDefined();
    unregisterV2Extension("fixture-surface");
    unregisterV2Extension("fixture-worker");
    unregisterV2Extension("fixture-greeter");
    expect(
      buildAppV2Catalog().entries.some((entry) => entry.id.startsWith("fixture-")),
    ).toBe(false);
    const restored = ensureV2DevFixtureHandlers();
    expect(
      buildAppV2Catalog().entries.filter((entry) => entry.id.startsWith("fixture-")).length,
    ).toBe(3);
    expect(restored.handlers).toEqual([]);
  });
});

describe("v2 fixture production exclusion", () => {
  const env = process.env as Record<string, string | undefined>;
  const savedNodeEnv = env.NODE_ENV;
  const savedFlag = env.FOLEYARD_V2_DEV_FIXTURES;
  afterEach(() => {
    if (savedNodeEnv === undefined) delete env.NODE_ENV;
    else env.NODE_ENV = savedNodeEnv;
    if (savedFlag === undefined) delete env.FOLEYARD_V2_DEV_FIXTURES;
    else env.FOLEYARD_V2_DEV_FIXTURES = savedFlag;
  });

  it("refuses fixture registration in production builds", () => {
    env.NODE_ENV = "production";
    env.FOLEYARD_V2_DEV_FIXTURES = "1";
    expect(devFixturesEnabled()).toBe(false);
    expect(() => registerV2DevFixtures()).toThrowError(/production/i);
  });

  it("carries no fixture-ID branches in production code", () => {
    const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
    const prodDirs = [
      "src/app/api/extensions-v2",
      "src/lib/extensions-v2",
      "src/components/extensions-v2",
      "src/components/extensions",
      "packages/yard-core/src/extensions-v2",
      "packages/yard-tools/make-pack-v2",
    ];
    // Fixture *definition* sources plus their tests are the allowlist:
    // they declare the IDs; production logic never branches on them.
    const allowedFile = new Set(["fixtures.ts", "fixture-definition.ts"]);
    const offenders: string[] = [];
    const visit = (dir: string): void => {
      for (const name of readdirSync(join(root, dir), { withFileTypes: true })) {
        const relative = `${dir}/${name.name}`;
        if (name.isDirectory()) {
          visit(relative);
          continue;
        }
        if (!/\.(ts|tsx)$/.test(name.name) || /\.test\.(ts|tsx)$/.test(name.name)) continue;
        if (allowedFile.has(name.name)) continue;
        const content = readFileSync(join(root, relative), "utf8");
        for (const id of ["fixture-surface", "fixture-worker", "fixture-greeter"]) {
          if (content.includes(id)) offenders.push(`${relative} references ${id}`);
        }
      }
    };
    for (const dir of prodDirs) visit(dir);
    expect(offenders).toEqual([]);
  });

  it("keeps the workbench out of packaged builds and non-prototype routes", () => {
    const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
    const builder = readFileSync(join(root, "electron-builder.yml"), "utf8");
    expect(builder).toContain("!.next/server/app/prototype/**");
    const workbench = "src/app/prototype/ext-v2-workbench/page.tsx";
    expect(readFileSync(join(root, workbench), "utf8")).toContain("Dev-only");
    const offenders: string[] = [];
    const visit = (dir: string): void => {
      for (const entry of readdirSync(join(root, dir), { withFileTypes: true })) {
        const relative = `${dir}/${entry.name}`;
        if (entry.isDirectory()) {
          if (relative === "src/app/prototype" || relative.startsWith("src/app/prototype/")) continue;
          visit(relative);
          continue;
        }
        if (!/\.(ts|tsx)$/.test(entry.name) || /\.test\.(ts|tsx)$/.test(entry.name)) continue;
        const content = readFileSync(join(root, relative), "utf8");
        if (content.includes("ext-v2-workbench") || content.includes("fixture-handlers")) {
          offenders.push(relative);
        }
      }
    };
    visit("src/app");
    visit("src/lib");
    visit("src/components");
    expect(offenders).toEqual([]);
  });
});
