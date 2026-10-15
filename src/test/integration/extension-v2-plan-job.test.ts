// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import {
  createMakePackV2Definition,
  MAKE_PACK_V2_ID,
  MAKE_PACK_V2_SOURCE_RECENT,
  MAKE_PACK_V2_SOURCE_SELECTION,
  MAKE_PACK_V2_SOURCE_SHELF,
  registerMakePackV2Handlers,
  type MakePackV2Result,
} from "@foleyard/make-pack-v2";
import {
  createV2OperationServices,
  ExtensionV2Host,
  ExtensionV2Registry,
  V2GrantStore,
  type IndexedAudioFile,
  type V2FileContentPorts,
  type V2HostServices,
  type V2LibraryReadPorts,
  type V2PlanReview,
  type V2JobRecord,
} from "@yard-core";
import { createV2ArchivePorts } from "@/lib/extensions-v2/archive";
import { createV2FileContentPorts } from "@/lib/extensions-v2/filesystem";
import { getV2Runtime } from "@/lib/extensions-v2/runtime";

import { callRoute } from "@/test/fixtures";
import { POST as executePOST } from "@/app/api/extensions-v2/execute/route";
import { GET as planGET } from "@/app/api/extensions-v2/plans/[planId]/route";
import { POST as planJobPOST } from "@/app/api/extensions-v2/plans/[planId]/job/route";
import { GET as jobGET } from "@/app/api/extensions-v2/jobs/[jobId]/route";

// Area: extension v2 R8 (#280). Make Pack's dialog, review plan, and
// background job are one bound operation: the job runs the target IDs
// and order that were reviewed, never a source re-resolved after the
// fact, and a changed option or destination rejects the stale approval
// (`plan-altered`) instead of executing it. Real files under temp
// directories, the production file/archive ports, and the real handlers
// exercise the whole path.

const FULL_PERMISSIONS = [
  "library:read",
  "files:read",
  "files:copy",
  "files:write",
  "settings:read",
  "settings:write",
  "desktop:reveal",
  "desktop:open",
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
  libDir: string;
  outDir: string;
  otherOutDir: string;
  host: ExtensionV2Host;
  grants: V2GrantStore;
  grantId: string;
  otherGrantId: string;
  shelf: string[];
  recent: string[];
};

function buildWorld(input: {
  files: Array<{ id: string; filename: string; contents: string }>;
  shelf?: string[];
  recent?: string[];
  extraOutFiles?: Array<{ name: string; contents: string }>;
}): World {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "foleyard-plan-job-")));
  const libDir = path.join(root, "lib");
  const outDir = path.join(root, "out");
  const otherOutDir = path.join(root, "other-out");
  for (const dir of [libDir, outDir, otherOutDir]) fs.mkdirSync(dir, { recursive: true });
  for (const file of input.files) {
    fs.writeFileSync(path.join(libDir, file.filename), file.contents);
  }
  for (const extra of input.extraOutFiles ?? []) {
    fs.writeFileSync(path.join(outDir, extra.name), extra.contents);
  }

  const records = input.files.map((file) => record(file.id, libDir, file.filename));
  const byId = new Map(records.map((file) => [file.id, file]));
  const library: V2LibraryReadPorts = {
    getFileById: (id) => byId.get(id) ?? null,
    getFilesByIds: (ids) => ids.flatMap((id) => (byId.get(id) ? [byId.get(id)!] : [])),
    listPage: () => ({ files: records, nextCursor: null }),
  };
  const filePorts: V2FileContentPorts = {
    ...createV2FileContentPorts(),
    libraryRoots: () => [libDir],
  };
  const grants = new V2GrantStore();
  const grant = grants.issue(MAKE_PACK_V2_ID, outDir);
  const otherGrant = grants.issue(MAKE_PACK_V2_ID, otherOutDir);

  const world: World = {
    root,
    libDir,
    outDir,
    otherOutDir,
    host: undefined as unknown as ExtensionV2Host,
    grants,
    grantId: grant.grantId,
    otherGrantId: otherGrant.grantId,
    shelf: input.shelf ?? [],
    recent: input.recent ?? [],
  };

  const settingsRows = new Map<string, unknown>();
  const registry = new ExtensionV2Registry();
  registry.register(createMakePackV2Definition());
  const services: V2HostServices = {
    registry,
    isEnabled: () => true,
    capabilities: {},
    grantedPermissions: () => [...FULL_PERMISSIONS],
    ports: library,
    authorizeGrant: (grantId, extensionId) => {
      const authorized = grants.authorize(grantId, extensionId);
      return authorized.ok ? { ok: true } : { ok: false, message: authorized.message };
    },
    createOperations: (binding) =>
      createV2OperationServices({
        ...binding,
        grants,
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
        selectionSources: [
          { name: "shelf", requiredPermission: "library:read", listIds: () => [...world.shelf] },
          { name: "recent", requiredPermission: "library:read", listIds: () => [...world.recent] },
        ],
      }),
  };
  const host = new ExtensionV2Host(services);
  registerMakePackV2Handlers(host);
  world.host = host;
  return world;
}

let worlds: World[] = [];
beforeEach(() => {
  worlds = [];
});
afterEach(() => {
  for (const world of worlds) fs.rmSync(world.root, { recursive: true, force: true });
  worlds = [];
});

function make(input: Parameters<typeof buildWorld>[0]): World {
  const world = buildWorld(input);
  worlds.push(world);
  return world;
}

/** Preview → host-stamped review, exactly the dialog's two steps. */
async function review(
  world: World,
  commandId: string,
  input: Record<string, unknown>,
  fileIds: readonly string[],
): Promise<{ planId: string; review: V2PlanReview }> {
  const previewed = await world.host.execute({
    extensionId: MAKE_PACK_V2_ID,
    commandId,
    input,
    selection: { fileIds },
  });
  expect(previewed.ok).toBe(true);
  if (!previewed.ok || previewed.outcome.kind !== "review-required") {
    throw new Error("expected a review-required outcome");
  }
  const reviewed = world.host.reviewPlan(previewed.outcome.planId);
  expect(reviewed.ok).toBe(true);
  if (!reviewed.ok) throw new Error("expected a review payload");
  return { planId: previewed.outcome.planId, review: reviewed.review };
}

async function settlePlanJob(
  world: World,
  planId: string,
  echo: { targets: unknown; options: unknown },
) {
  const submitted = await world.host.submitPlanJob(planId, echo);
  expect(submitted.ok).toBe(true);
  if (!submitted.ok || submitted.outcome.kind !== "job") {
    throw new Error(`expected a job outcome, got ${JSON.stringify(submitted)}`);
  }
  return world.host.jobs.waitFor(submitted.outcome.jobId);
}

describe("make-pack-v2 plan-bound jobs", () => {
  it("runs the reviewed targets and order, not a source re-resolved after review", async () => {
    const world = make({
      files: [
        { id: "a", filename: "a.wav", contents: "aaa" },
        { id: "b", filename: "b.wav", contents: "bbb" },
        { id: "c", filename: "c.wav", contents: "ccc" },
      ],
      shelf: ["b", "a"],
    });
    const { planId, review: reviewed } = await review(
      world,
      MAKE_PACK_V2_SOURCE_SHELF,
      { grantId: world.grantId, packName: "Shelf", includeManifest: true },
      [],
    );
    expect(reviewed.targets.fileIds).toEqual(["b", "a"]);

    // The Shelf changes between review and job submit.
    world.shelf = ["c"];

    const settled = await settlePlanJob(world, planId, {
      targets: reviewed.targets,
      options: reviewed.options,
    });
    expect(settled.state).toBe("succeeded");
    const value = settled.value as MakePackV2Result;
    expect(value.copied).toBe(2);
    expect(fs.existsSync(path.join(world.outDir, "a.wav"))).toBe(true);
    expect(fs.existsSync(path.join(world.outDir, "b.wav"))).toBe(true);
    expect(fs.existsSync(path.join(world.outDir, "c.wav"))).toBe(false);
    const manifest = JSON.parse(
      fs.readFileSync(path.join(world.outDir, "manifest.json"), "utf8"),
    ) as { files: Array<{ outputName: string }> };
    expect(manifest.files.map((file) => file.outputName)).toEqual(["b.wav", "a.wav"]);
  });

  it("rejects a stale approval when a reviewed option changed after review", async () => {
    const world = make({ files: [{ id: "a", filename: "a.wav", contents: "aaa" }] });
    const { planId, review: reviewed } = await review(
      world,
      MAKE_PACK_V2_SOURCE_SELECTION,
      { grantId: world.grantId, packName: "Reviewed" },
      ["a"],
    );

    const submitted = await world.host.submitPlanJob(planId, {
      targets: reviewed.targets,
      options: { ...(reviewed.options as Record<string, unknown>), packName: "Changed" },
    });
    expect(submitted.ok).toBe(false);
    if (!submitted.ok) expect(submitted.code).toBe("plan-altered");
    expect(fs.existsSync(path.join(world.outDir, "a.wav"))).toBe(false);
  });

  it("rejects a stale approval when the destination changed after review", async () => {
    const world = make({ files: [{ id: "a", filename: "a.wav", contents: "aaa" }] });
    const { planId, review: reviewed } = await review(
      world,
      MAKE_PACK_V2_SOURCE_SELECTION,
      { grantId: world.grantId, packName: "Reviewed" },
      ["a"],
    );

    const submitted = await world.host.submitPlanJob(planId, {
      targets: reviewed.targets,
      options: { ...(reviewed.options as Record<string, unknown>), grantId: world.otherGrantId },
    });
    expect(submitted.ok).toBe(false);
    if (!submitted.ok) expect(submitted.code).toBe("plan-altered");
    expect(fs.existsSync(path.join(world.outDir, "a.wav"))).toBe(false);
    expect(fs.existsSync(path.join(world.otherOutDir, "a.wav"))).toBe(false);
  });

  it("covers selection, shelf, and recent from review through the terminal result", async () => {
    const cases = [
      {
        commandId: MAKE_PACK_V2_SOURCE_SELECTION,
        fileIds: ["a"],
        expected: ["a.wav"],
      },
      { commandId: MAKE_PACK_V2_SOURCE_SHELF, fileIds: [], expected: ["b.wav"] },
      { commandId: MAKE_PACK_V2_SOURCE_RECENT, fileIds: [], expected: ["c.wav"] },
    ] as const;

    for (const testCase of cases) {
      const world = make({
        files: [
          { id: "a", filename: "a.wav", contents: "aaa" },
          { id: "b", filename: "b.wav", contents: "bbb" },
          { id: "c", filename: "c.wav", contents: "ccc" },
        ],
        shelf: ["b"],
        recent: ["c"],
      });
      const { planId, review: reviewed } = await review(
        world,
        testCase.commandId,
        { grantId: world.grantId, packName: "Bound", includeManifest: false },
        testCase.fileIds,
      );
      const settled = await settlePlanJob(world, planId, {
        targets: reviewed.targets,
        options: reviewed.options,
      });
      expect(settled.state).toBe("succeeded");
      const value = settled.value as MakePackV2Result;
      expect(value.copied).toBe(testCase.expected.length);
      for (const name of testCase.expected) {
        expect(fs.existsSync(path.join(world.outDir, name))).toBe(true);
      }
      // A succeeded job exposes its bounded, schema-shaped result too.
      expect(settled.result?.value).toMatchObject({ outputFormat: "folder" });
    }
  });

  it("exposes counts, the output reference, and partial outcomes on a succeeded job", async () => {
    const world = make({
      files: [
        { id: "a", filename: "a.wav", contents: "NEW" },
        { id: "b", filename: "b.wav", contents: "bbb" },
      ],
      extraOutFiles: [{ name: "a.wav", contents: "ORIGINAL" }],
    });
    const { planId, review: reviewed } = await review(
      world,
      MAKE_PACK_V2_SOURCE_SELECTION,
      { grantId: world.grantId, packName: "Partial", includeManifest: false },
      ["a", "b"],
    );
    const settled = await settlePlanJob(world, planId, {
      targets: reviewed.targets,
      options: reviewed.options,
    });
    expect(settled.state).toBe("succeeded");
    const value = settled.result?.value as MakePackV2Result;
    expect(value.copied).toBe(1);
    expect(value.failedFiles).toEqual(["a.wav"]);
    expect(value.failedReasons[0]).toMatch(/already exists/);
    expect(value.outputPath).toBe(world.outDir);
    expect(fs.readFileSync(path.join(world.outDir, "a.wav"), "utf8")).toBe("ORIGINAL");
  });
});

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
    const response = await jobGET(
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

describe("make-pack-v2 plan-bound jobs over the HTTP routes", () => {
  let world: World;
  let saved: { host: unknown; jobs: unknown; jobsRestored: boolean };

  beforeEach(() => {
    world = make({
      files: [
        { id: "a", filename: "a.wav", contents: "aaa" },
        { id: "b", filename: "b.wav", contents: "bbb" },
      ],
      shelf: ["a", "b"],
    });
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
  });

  async function routeReview(): Promise<{ planId: string; review: V2PlanReview }> {
    const previewed = await callRoute<{ outcome: { kind: string; planId: string } }>(executePOST, {
      url: "http://localhost/api/extensions-v2/execute",
      body: {
        extensionId: MAKE_PACK_V2_ID,
        commandId: MAKE_PACK_V2_SOURCE_SHELF,
        input: { grantId: world.grantId, packName: "Routed", includeManifest: false },
        selection: { fileIds: [] },
      },
    });
    expect(previewed.status).toBe(200);
    expect(previewed.body.outcome.kind).toBe("review-required");
    const previewedPlanId = previewed.body.outcome.planId;
    const response = await planGET(
      new NextRequest(`http://localhost/api/extensions-v2/plans/${previewedPlanId}`),
      { params: Promise.resolve({ planId: previewedPlanId }) },
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { review: V2PlanReview };
    return { planId: previewedPlanId, review: body.review };
  }

  it("previews through execute, reviews, and runs the reviewed plan as a 202 job", async () => {
    const { planId, review: reviewed } = await routeReview();

    // The Shelf changes after review; the reviewed plan still governs.
    world.shelf = [];

    const submitted = await planJobPOST(
      new NextRequest(`http://localhost/api/extensions-v2/plans/${planId}/job`, {
        method: "POST",
        body: JSON.stringify({ targets: reviewed.targets, options: reviewed.options }),
      }),
      { params: Promise.resolve({ planId }) },
    );
    expect(submitted.status).toBe(202);
    const submittedBody = (await submitted.json()) as { outcome: { kind: string; jobId: string } };
    expect(submittedBody.outcome.kind).toBe("job");

    const job = await pollJob(submittedBody.outcome.jobId);
    expect(job.state).toBe("succeeded");
    const value = job.result?.value as MakePackV2Result;
    expect(value.copied).toBe(2);
    expect(job.value).toBeUndefined();
    expect(fs.existsSync(path.join(world.outDir, "a.wav"))).toBe(true);
    expect(fs.existsSync(path.join(world.outDir, "b.wav"))).toBe(true);
  });

  it("rejects an altered echo instead of executing the stale approval", async () => {
    const { planId, review: reviewed } = await routeReview();

    const submitted = await planJobPOST(
      new NextRequest(`http://localhost/api/extensions-v2/plans/${planId}/job`, {
        method: "POST",
        body: JSON.stringify({
          targets: reviewed.targets,
          options: { ...(reviewed.options as Record<string, unknown>), packName: "Altered" },
        }),
      }),
      { params: Promise.resolve({ planId }) },
    );
    expect(submitted.status).toBe(400);
    const submittedBody = (await submitted.json()) as { error: { code: string; message: string } };
    expect(submittedBody.error.code).toBe("plan-altered");
    expect(fs.existsSync(path.join(world.outDir, "a.wav"))).toBe(false);
  });
});
