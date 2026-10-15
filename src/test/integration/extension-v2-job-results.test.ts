// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import {
  createMakePackV2Definition,
  MAKE_PACK_V2_ID,
  MAKE_PACK_V2_SOURCE_SELECTION,
  registerMakePackV2Handlers,
} from "@foleyard/make-pack-v2";
import {
  createLibraryGathererV2Definition,
  LIBRARY_GATHERER_V2_GATHER,
  LIBRARY_GATHERER_V2_ID,
  registerLibraryGathererV2Handlers,
} from "@foleyard/library-gatherer-v2";
import {
  createV2ExtendedOperations,
  createV2OperationServices,
  ExtensionV2Host,
  ExtensionV2Registry,
  V2GrantStore,
  V2JobManager,
  V2SourceGrantStore,
  type IndexedAudioFile,
  type V2FileContentPorts,
  type V2HostServices,
  type V2JobRecord,
  type ScanFileRecord,
  type V2LibraryMutationPorts,
  type V2LibraryReadPorts,
} from "@yard-core";
import { createV2ArchivePorts } from "@/lib/extensions-v2/archive";
import { createV2FolderScanPorts } from "@/lib/extensions-v2/maintenance";
import { createV2FileContentPorts } from "@/lib/extensions-v2/filesystem";
import { getV2Runtime } from "@/lib/extensions-v2/runtime";

import { callRoute } from "@/test/fixtures";
import { GET as getJobRoute } from "@/app/api/extensions-v2/jobs/[jobId]/route";
import { POST as postJobRoute } from "@/app/api/extensions-v2/jobs/route";

// Area: extension v2 R4 (#279). Route-level evidence that a successful
// Make Pack and Library Gatherer job returns its declared, bounded
// terminal result through the HTTP job API. The routes, the job manager,
// the host execution path, both tools' real definitions/handlers, and the
// shipped file/archive/folder ports are all real; only the application
// library reads, settings rows, grants, and index writes are substituted
// (the same substitution the tools' own handler suites make). The host is
// installed on the process-wide runtime so the routes serve it.

const MAKE_PACK_PERMISSIONS = [
  "library:read",
  "files:read",
  "files:copy",
  "files:write",
  "settings:read",
  "settings:write",
  "desktop:reveal",
  "desktop:open",
];
const GATHER_PERMISSIONS = [
  "library:read",
  "library:write",
  "files:read",
  "files:copy",
  "settings:read",
  "settings:write",
];

function record(id: string, dir: string, filename: string): IndexedAudioFile {
  return {
    id,
    path: path.join(dir, filename),
    filename,
    libraryRoot: dir,
    directory: null,
    format: path.extname(filename).slice(1) || null,
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

type World = {
  root: string;
  host: ExtensionV2Host;
  makePackGrantId: string;
  gatherDestGrantId: string;
  gatherSourceGrantId: string;
  inserted: ScanFileRecord[];
};

function buildWorld(): World {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "foleyard-results-")));
  const libDir = path.join(root, "lib");
  const outDir = path.join(root, "pack-out");
  const sourceDir = path.join(root, "source-inbox");
  const gatherDir = path.join(root, "gather-in");
  for (const dir of [libDir, outDir, sourceDir, gatherDir]) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(libDir, "kick.wav"), "kick-bytes");
  fs.writeFileSync(path.join(libDir, "snare.wav"), "snare-bytes");
  fs.writeFileSync(path.join(sourceDir, "hat.wav"), "hat-bytes");
  fs.mkdirSync(path.join(sourceDir, "sub"));
  fs.writeFileSync(path.join(sourceDir, "sub", "clap.wav"), "clap-bytes");
  fs.writeFileSync(path.join(sourceDir, "notes.txt"), "not audio");

  const registry = new ExtensionV2Registry();
  registry.register(createMakePackV2Definition());
  registry.register(createLibraryGathererV2Definition());

  const records = [record("a", libDir, "kick.wav"), record("b", libDir, "snare.wav")];
  const byId = new Map(records.map((file) => [file.id, file]));
  const library: V2LibraryReadPorts = {
    getFileById: (id) => byId.get(id) ?? null,
    getFilesByIds: (ids) => ids.flatMap((id) => (byId.get(id) ? [byId.get(id)!] : [])),
    listPage: () => ({ files: records, nextCursor: null }),
  };

  const grants = new V2GrantStore();
  const makePackGrant = grants.issue(MAKE_PACK_V2_ID, outDir);
  const gatherDestGrant = grants.issue(LIBRARY_GATHERER_V2_ID, gatherDir);
  const sources = new V2SourceGrantStore();
  const gatherSourceGrant = sources.issue(LIBRARY_GATHERER_V2_ID, sourceDir);

  const inserted: ScanFileRecord[] = [];
  const mutations: V2LibraryMutationPorts = {
    markRemovedByPaths: () => {},
    insertRecords: (rows) => {
      inserted.push(...rows);
    },
  };

  const settingsRows = new Map<string, unknown>();
  const filePorts: V2FileContentPorts = {
    ...createV2FileContentPorts(),
    libraryRoots: () => [libDir],
  };

  const services: V2HostServices = {
    registry,
    isEnabled: () => true,
    capabilities: {},
    grantedPermissions: (extensionId) =>
      extensionId === MAKE_PACK_V2_ID
        ? MAKE_PACK_PERMISSIONS
        : extensionId === LIBRARY_GATHERER_V2_ID
          ? GATHER_PERMISSIONS
          : [],
    ports: library,
    authorizeGrant: (grantId, extensionId) => {
      const authorized = grants.authorize(grantId, extensionId);
      return authorized.ok ? { ok: true } : { ok: false, message: authorized.message };
    },
    jobManager: new V2JobManager(),
    createOperations: (binding) => ({
      ...createV2OperationServices({
        ...binding,
        grants,
        sources,
        library,
        files: filePorts,
        archive: createV2ArchivePorts(),
        settings: {
          readRaw: (key) => settingsRows.get(key),
          writeRaw: (key, value) => {
            settingsRows.set(key, value);
          },
        },
        extensionState: { readAll: () => ({}), writeAll: () => {} },
        settingsDeclarations: registry.get(binding.extensionId)?.settings,
      }),
      ...createV2ExtendedOperations({
        extensionId: binding.extensionId,
        effectivePermissions: binding.effectivePermissions,
        library,
        mutations,
        folders: createV2FolderScanPorts({ libraryRoots: () => [libDir] }),
        sources,
      }),
    }),
  };

  const host = new ExtensionV2Host(services);
  registerMakePackV2Handlers(host);
  registerLibraryGathererV2Handlers(host);
  return {
    root,
    host,
    makePackGrantId: makePackGrant.grantId,
    gatherDestGrantId: gatherDestGrant.grantId,
    gatherSourceGrantId: gatherSourceGrant.grantId,
    inserted,
  };
}

function terminalJob(job: V2JobRecord): boolean {
  return (
    job.state === "succeeded" ||
    job.state === "failed" ||
    job.state === "cancelled" ||
    job.state === "interrupted"
  );
}

async function pollJob(jobId: string): Promise<V2JobRecord> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const response = await getJobRoute(
      new NextRequest(`http://localhost/api/extensions-v2/jobs/${jobId}`),
      { params: Promise.resolve({ jobId }) },
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { job: V2JobRecord };
    if (terminalJob(body.job)) return body.job;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`Job "${jobId}" did not reach a terminal state.`);
}

async function submitJob(body: unknown): Promise<V2JobRecord> {
  const response = await callRoute(postJobRoute, {
    url: "http://localhost/api/extensions-v2/jobs",
    body,
  });
  expect(response.status).toBe(202);
  const outcome = (response.body as { outcome: { jobId: string } }).outcome;
  return pollJob(outcome.jobId);
}

let world: World;
let saved: { host: unknown; jobs: unknown; jobsRestored: boolean };

beforeEach(() => {
  world = buildWorld();
  const runtime = getV2Runtime();
  saved = { host: runtime.host, jobs: runtime.jobs, jobsRestored: runtime.jobsRestored };
  runtime.host = world.host;
  runtime.jobs = world.host.jobs;
  runtime.jobsRestored = true;
});

afterEach(() => {
  const runtime = getV2Runtime();
  runtime.host = saved.host as typeof runtime.host;
  runtime.jobs = saved.jobs as typeof runtime.jobs;
  runtime.jobsRestored = saved.jobsRestored;
  fs.rmSync(world.root, { recursive: true, force: true });
});

describe("v2 job terminal results over the HTTP job API", () => {
  it("Make Pack returns its declared pack result for a succeeded job", async () => {
    const job = await submitJob({
      extensionId: MAKE_PACK_V2_ID,
      commandId: MAKE_PACK_V2_SOURCE_SELECTION,
      input: { grantId: world.makePackGrantId, packName: "Route Pack", includeManifest: false },
      selection: { fileIds: ["a", "b"] },
    });

    expect(job.state).toBe("succeeded");
    // The raw handler value is memory-only; only the bounded projection travels.
    expect(job.value).toBeUndefined();
    expect(job.result?.diagnostic).toBeUndefined();
    expect(job.result?.value).toMatchObject({
      packName: "Route Pack",
      outputFormat: "folder",
      copied: 2,
      skipped: [],
      missing: [],
      failedFiles: [],
      manifestIncluded: false,
      revealCapability: "desktop:reveal",
    });
    const value = job.result?.value as { outputPath: string };
    expect(fs.existsSync(value.outputPath)).toBe(true);
    expect(fs.readFileSync(path.join(value.outputPath, "kick.wav"), "utf8")).toBe("kick-bytes");
    expect(fs.readFileSync(path.join(value.outputPath, "snare.wav"), "utf8")).toBe("snare-bytes");
  });

  it("Library Gatherer returns copied, skipped, and failed outcomes for a succeeded job", async () => {
    const job = await submitJob({
      extensionId: LIBRARY_GATHERER_V2_ID,
      commandId: LIBRARY_GATHERER_V2_GATHER,
      input: {
        sourceGrantIds: [world.gatherSourceGrantId],
        destGrantId: world.gatherDestGrantId,
        preserveFolderNames: false,
      },
      selection: {},
    });

    expect(job.state).toBe("succeeded");
    expect(job.value).toBeUndefined();
    expect(job.result?.diagnostic).toBeUndefined();
    expect(job.result?.value).toMatchObject({
      copied: 2,
      inserted: 2,
      skipped: 0,
      failedSources: [],
      failedReasons: [],
    });
    const value = job.result?.value as { copiedPaths: string[] };
    expect(value.copiedPaths).toHaveLength(2);
    expect(fs.existsSync(path.join(world.root, "gather-in", "hat.wav"))).toBe(true);
    expect(fs.existsSync(path.join(world.root, "gather-in", "clap.wav"))).toBe(true);
    expect(world.inserted.map((row) => row.filename).sort()).toEqual(["clap.wav", "hat.wav"]);
  });
});
