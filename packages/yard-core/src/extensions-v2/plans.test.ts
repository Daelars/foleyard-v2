import { describe, expect, it } from "vitest";

import {
  createV2OperationServices,
  encodeV2Failure,
  ExtensionV2Host,
  ExtensionV2Registry,
  handleV2HttpPlanApply,
  handleV2HttpPlanGet,
  immediateV2Result,
  reviewV2Result,
  V2_EXTENSION_API_VERSION,
  V2GrantStore,
  V2PlanManager,
  type ExtensionV2Definition,
  type ExtensionV2ValueSchema,
  type V2ArchivePorts,
  type V2ExtensionStatePorts,
  type V2FileContentPorts,
  type V2HandlerContext,
  type V2HostServices,
  type V2LibraryPorts,
  type V2LibraryReadPorts,
  type V2SettingsPorts,
} from "./index";
import { audioFile, fakePathIo, libraryPorts } from "./test-helpers";

// Area: extension v2 R5+R7 (#169). Host-validated prepare/review/apply:
// binding, expiry, altered/expired/replayed rejection, destructive
// review gate, grant/target revalidation, the Make Pack preview channel,
// and the plan HTTP codec. Destructive behavior runs against fake files;
// no destructive end-user extension ships here.

const EXTENSION_ID = "fixture-pack";
const PREVIEW_COMMAND = "fixture-pack.preview";
const PUBLISH_COMMAND = "fixture-pack.publish";

function planFixtureDefinition(): ExtensionV2Definition {
  const input: {
    kind: "object";
    properties: Record<string, ExtensionV2ValueSchema>;
    required: string[];
  } = {
    kind: "object",
    properties: {
      format: { kind: "enum", values: ["folder", "zip"] },
      grantId: { kind: "string", minLength: 1 },
    },
    required: ["format", "grantId"],
  };
  return {
    id: EXTENSION_ID,
    name: "Fixture Pack",
    version: "0.1.0",
    apiVersion: V2_EXTENSION_API_VERSION,
    description: "Plan/review/apply conformance fixture.",
    permissions: ["library:read", "files:read", "files:copy", "files:write", "settings:read", "settings:write"],
    commands: [
      {
        id: PREVIEW_COMMAND,
        title: "Preview pack",
        description: "Preview a pack without side effects.",
        scope: "selection",
        requiresSelection: true,
        input: { ...input, properties: { ...input.properties } },
        result: {
          kind: "object",
          properties: { exported: { kind: "number" } },
          required: ["exported"],
        },
      },
      {
        id: PUBLISH_COMMAND,
        title: "Publish pack",
        description: "Copy sources to the destination grant.",
        scope: "selection",
        requiresSelection: true,
        destructive: true,
        input: { ...input, properties: { ...input.properties } },
        result: {
          kind: "object",
          properties: { exported: { kind: "number" } },
          required: ["exported"],
        },
      },
    ],
  };
}

type FixtureWorld = {
  host: ExtensionV2Host;
  grants: V2GrantStore;
  grantId: string;
  bytes: Map<string, Uint8Array>;
  granted: string[];
};

function fixtureWorld(overrides?: { granted?: string[] }): FixtureWorld {
  const registry = new ExtensionV2Registry();
  registry.register(planFixtureDefinition());
  const granted = overrides?.granted ?? [
    "library:read",
    "files:read",
    "files:copy",
    "files:write",
    "settings:read",
    "settings:write",
  ];
  const files = [
    audioFile("a", { path: "/lib/a.mp3", filename: "a.mp3", libraryRoot: "/lib" }),
    audioFile("b", { path: "/lib/b.mp3", filename: "b.mp3", libraryRoot: "/lib" }),
  ];
  const bytes = new Map<string, Uint8Array>([
    ["/lib/a.mp3", new TextEncoder().encode("aaa")],
    ["/lib/b.mp3", new TextEncoder().encode("bbb")],
    ["/out/keep.txt", new TextEncoder().encode("unrelated")],
  ]);
  const io = fakePathIo(["/lib", "/lib/a.mp3", "/lib/b.mp3", "/out", "/out/keep.txt"]);
  const filePorts: V2FileContentPorts = {
    readFileBytes: async (path) => {
      const data = bytes.get(path);
      if (!data) throw new Error(`missing ${path}`);
      return data;
    },
    copyFile: async (source, dest) => {
      const data = bytes.get(source);
      if (!data) throw new Error(`missing ${source}`);
      bytes.set(dest, data);
    },
    writeFileBytes: async (dest, data) => {
      bytes.set(dest, data);
    },
    deleteFile: async (path) => {
      bytes.delete(path);
    },
    exists: async (path) => bytes.has(path),
    libraryRoots: () => ["/lib"],
    pathIo: () => io,
  };
  const library: V2LibraryReadPorts = {
    ...libraryPorts(files),
    listPage: (cursor, limit) => {
      void cursor;
      void limit;
      return { files, nextCursor: null };
    },
  };
  const settingsRows = new Map<string, unknown>();
  const settingsPorts: V2SettingsPorts = {
    readRaw: (key) => settingsRows.get(key),
    writeRaw: (key, value) => {
      settingsRows.set(key, value);
    },
  };
  const stateBlobs = new Map<string, Record<string, unknown>>();
  const statePorts: V2ExtensionStatePorts = {
    readAll: (extensionId) => stateBlobs.get(extensionId) ?? {},
    writeAll: (extensionId, state) => {
      stateBlobs.set(extensionId, state);
    },
  };
  const archive: V2ArchivePorts = {
    createZipArchive: async () => ({ bytesWritten: 0 }),
  };
  const grants = new V2GrantStore();
  const grant = grants.issue(EXTENSION_ID, "/out");

  const services: V2HostServices = {
    registry,
    isEnabled: () => true,
    capabilities: new Set<string>(),
    grantedPermissions: () => [...granted],
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
        archive,
        settings: settingsPorts,
        extensionState: statePorts,
        selectionSources: [],
      }),
  };
  const host = new ExtensionV2Host(services);

  const handler = () => async (context: V2HandlerContext) => {
    const options = context.invocation.input as { format: string; grantId: string };
    if (!context.plan) {
      const { planId } = context.operations.plans.prepare({
        targets: { fileIds: context.files.map((file) => file.id) },
        options,
        grantIds: [options.grantId],
        preview: {
          summary: `Export ${context.files.length} sounds as ${options.format}`,
          tables: [
            {
              id: "sources",
              title: "Sources",
              columns: ["file", "name"],
              rows: context.files.map((file) => [file.id, file.filename ?? file.id]),
            },
          ],
          notices: [],
          details: {
            sources: context.files.map((file) => file.id),
            names: context.files.map((file) => file.filename ?? file.id),
            format: options.format,
            destination: "/out",
            conflicts: [],
            missing: [],
            manifestChoice: true,
          },
          reversibility: "irreversible-files",
          reversibilityNote: "Copied bytes leave job ownership; no undo is offered.",
        },
      });
      return reviewV2Result(planId, "stale handler summary", "2000-01-01T00:00:00.000Z");
    }
    let exported = 0;
    for (const file of context.files) {
      await context.operations.files.copyToOutput(
        file.id,
        file.filename ?? `${file.id}.mp3`,
        (context.plan.options as { grantId: string }).grantId,
      );
      exported += 1;
    }
    return immediateV2Result({ exported });
  };
  host.registerHandler(EXTENSION_ID, PREVIEW_COMMAND, handler());
  host.registerHandler(EXTENSION_ID, PUBLISH_COMMAND, handler());
  return { host, grants, grantId: grant.grantId, bytes, granted };
}

function input(grantId: string) {
  return { format: "folder", grantId };
}

describe("prepare/review/apply", () => {
  it("runs the full flow and binds the outcome to the stored record", async () => {
    const { host, grantId } = fixtureWorld();
    const executed = await host.execute({
      extensionId: EXTENSION_ID,
      commandId: PREVIEW_COMMAND,
      input: input(grantId),
      selection: { fileIds: ["a", "b"] },
    });
    expect(executed.ok).toBe(true);
    if (!executed.ok || executed.outcome.kind !== "review-required") {
      throw new Error("expected a review-required outcome");
    }
    expect(executed.outcome.planId.startsWith("vplan_")).toBe(true);
    // Host-owned summary/expiry win over the handler's stale strings.
    expect(executed.outcome.summary).toBe("Export 2 sounds as folder");

    const reviewed = host.reviewPlan(executed.outcome.planId);
    expect(reviewed.ok).toBe(true);
    if (!reviewed.ok) throw new Error("expected a review payload");
    expect(reviewed.review.targets).toEqual({ fileIds: ["a", "b"] });
    expect(reviewed.review.options).toEqual(input(grantId));
    expect(reviewed.review.reviewedAt).toBeTruthy();

    const applied = await host.applyPlan(executed.outcome.planId, {
      targets: reviewed.review.targets,
      options: reviewed.review.options,
    });
    expect(applied.ok).toBe(true);
    if (applied.ok) {
      expect(applied.outcome.kind).toBe("immediate");
      if (applied.outcome.kind === "immediate") {
        expect(applied.outcome.value).toEqual({ exported: 2 });
      }
    }
  });

  it("rejects forged plan IDs at execute time", async () => {
    const thief = fixtureWorld();
    thief.host.registerHandler(EXTENSION_ID, PREVIEW_COMMAND, () =>
      reviewV2Result("vplan_forged", "Forged", "2030-01-01T00:00:00.000Z"),
    );
    const result = await thief.host.execute({
      extensionId: EXTENSION_ID,
      commandId: PREVIEW_COMMAND,
      input: input(thief.grantId),
      selection: { fileIds: ["a"] },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("result-invalid");
  });

  it("rejects altered echoes but leaves the plan pending for retry", async () => {
    const { host, grantId } = fixtureWorld();
    const executed = await host.execute({
      extensionId: EXTENSION_ID,
      commandId: PREVIEW_COMMAND,
      input: input(grantId),
      selection: { fileIds: ["a", "b"] },
    });
    if (!executed.ok || executed.outcome.kind !== "review-required") throw new Error("setup failed");
    const planId = executed.outcome.planId;
    const reviewed = host.reviewPlan(planId);
    if (!reviewed.ok) throw new Error("setup failed");

    const altered = await host.applyPlan(planId, {
      targets: { fileIds: ["a"] },
      options: reviewed.review.options,
    });
    expect(altered.ok).toBe(false);
    if (!altered.ok) expect(altered.code).toBe("plan-altered");

    const alteredOptions = await host.applyPlan(planId, {
      targets: reviewed.review.targets,
      options: { format: "zip", grantId },
    });
    expect(alteredOptions.ok).toBe(false);
    if (!alteredOptions.ok) expect(alteredOptions.code).toBe("plan-altered");

    // The pending plan still applies with the exact echo.
    const retry = await host.applyPlan(planId, {
      targets: reviewed.review.targets,
      options: reviewed.review.options,
    });
    expect(retry.ok).toBe(true);
  });

  it("rejects replays as consumed", async () => {
    const { host, grantId } = fixtureWorld();
    const executed = await host.execute({
      extensionId: EXTENSION_ID,
      commandId: PREVIEW_COMMAND,
      input: input(grantId),
      selection: { fileIds: ["a"] },
    });
    if (!executed.ok || executed.outcome.kind !== "review-required") throw new Error("setup failed");
    const reviewed = host.reviewPlan(executed.outcome.planId);
    if (!reviewed.ok) throw new Error("setup failed");
    const echo = { targets: reviewed.review.targets, options: reviewed.review.options };
    expect((await host.applyPlan(executed.outcome.planId, echo)).ok).toBe(true);
    const replay = await host.applyPlan(executed.outcome.planId, echo);
    expect(replay.ok).toBe(false);
    if (!replay.ok) expect(replay.code).toBe("plan-consumed");
  });

  it("rejects expired plans", async () => {
    const registry = new ExtensionV2Registry();
    registry.register(planFixtureDefinition());
    let nowMs = Date.parse("2026-09-06T00:00:00.000Z");
    const isoNow = () => new Date(nowMs).toISOString();
    const manager = new V2PlanManager(registry, { clock: isoNow, nowMs: () => nowMs });
    const record = manager.prepare(
      {
        extensionId: EXTENSION_ID,
        invocationId: "vinv_test",
        commandId: PREVIEW_COMMAND,
        effectivePermissions: [],
        capabilities: [],
      },
      {
        targets: { fileIds: ["a"] },
        options: { format: "folder", grantId: "vgrant_test" },
        preview: {
          summary: "Expiring",
          tables: [],
          notices: [],
          reversibility: "job-temp-cleanup",
          reversibilityNote: "Temp only.",
        },
        ttlMs: 1000,
      },
    );
    nowMs += 2000;
    expect(() => manager.review(record.planId, EXTENSION_ID)).toThrowError(/expired/);
    try {
      manager.checkForApply(record.planId, EXTENSION_ID, {
        targets: { fileIds: ["a"] },
        options: { format: "folder", grantId: "vgrant_test" },
      });
      throw new Error("should have thrown");
    } catch (error) {
      expect((error as { failureCode?: string }).failureCode).toBe("plan-expired");
    }
  });

  it("reports unknown plans", async () => {
    const { host } = fixtureWorld();
    const reviewed = host.reviewPlan("vplan_missing");
    expect(reviewed.ok).toBe(false);
    if (!reviewed.ok) expect(reviewed.code).toBe("plan-unknown");
    const applied = await host.applyPlan("vplan_missing", { targets: { fileIds: [] }, options: null });
    expect(applied.ok).toBe(false);
    if (!applied.ok) expect(applied.code).toBe("plan-unknown");
  });

  it("gates destructive plans on the host-recorded review, not a client flag", async () => {
    const { host, grantId, bytes } = fixtureWorld();
    const executed = await host.execute({
      extensionId: EXTENSION_ID,
      commandId: PUBLISH_COMMAND,
      input: input(grantId),
      selection: { fileIds: ["a"] },
    });
    if (!executed.ok || executed.outcome.kind !== "review-required") throw new Error("setup failed");
    const planId = executed.outcome.planId;

    // A client `confirmed: true` flag changes nothing without the review stamp.
    const unreviewed = await host.applyPlan(planId, {
      targets: { fileIds: ["a"] },
      options: { ...(input(grantId) as Record<string, unknown>), confirmed: true },
    });
    // The extra flag also makes the echo differ, which rejects first.
    expect(unreviewed.ok).toBe(false);
    if (!unreviewed.ok) expect(["plan-altered", "review-required"]).toContain(unreviewed.code);

    const exactEcho = await host.applyPlan(planId, {
      targets: { fileIds: ["a"] },
      options: input(grantId),
    });
    expect(exactEcho.ok).toBe(false);
    if (!exactEcho.ok) expect(exactEcho.code).toBe("review-required");

    const reviewed = host.reviewPlan(planId);
    if (!reviewed.ok) throw new Error("setup failed");
    const applied = await host.applyPlan(planId, {
      targets: reviewed.review.targets,
      options: reviewed.review.options,
    });
    expect(applied.ok).toBe(true);
    // The effect ran against fake files; unrelated files survive.
    expect(bytes.get("/out/a.mp3")).toEqual(new TextEncoder().encode("aaa"));
    expect(bytes.get("/out/keep.txt")).toEqual(new TextEncoder().encode("unrelated"));
  });

  it("revalidates revoked grants before apply and leaves the plan pending", async () => {
    const world = fixtureWorld();
    const { host, grants, grantId } = world;
    const executed = await host.execute({
      extensionId: EXTENSION_ID,
      commandId: PREVIEW_COMMAND,
      input: input(grantId),
      selection: { fileIds: ["a"] },
    });
    if (!executed.ok || executed.outcome.kind !== "review-required") throw new Error("setup failed");
    const reviewed = host.reviewPlan(executed.outcome.planId);
    if (!reviewed.ok) throw new Error("setup failed");
    grants.revoke(grantId);
    const denied = await host.applyPlan(executed.outcome.planId, {
      targets: reviewed.review.targets,
      options: reviewed.review.options,
    });
    expect(denied.ok).toBe(false);
    if (!denied.ok) expect(denied.code).toBe("permission-denied");
  });

  it("rejects applies whose targets left the Library index", async () => {
    const registry = new ExtensionV2Registry();
    registry.register(planFixtureDefinition());
    const live = [
      audioFile("a", { path: "/lib/a.mp3", filename: "a.mp3", libraryRoot: "/lib" }),
    ];
    // Mutable ports: the target leaves the index between review and apply.
    const ports: V2LibraryPorts = {
      getFileById: (id) => live.find((file) => file.id === id) ?? null,
      getFilesByIds: (ids) => live.filter((file) => ids.includes(file.id)),
    };
    const services: V2HostServices = {
      registry,
      isEnabled: () => true,
      capabilities: new Set<string>(),
      grantedPermissions: () => ["library:read", "files:read", "files:copy", "files:write", "settings:read", "settings:write"],
      ports,
    };
    const host = new ExtensionV2Host(services);
    host.registerHandler(EXTENSION_ID, PREVIEW_COMMAND, (context) => {
      const prepared = context.operations.plans.prepare({
        targets: { fileIds: ["a"] },
        preview: {
          summary: "One",
          tables: [],
          notices: [],
          reversibility: "job-temp-cleanup",
          reversibilityNote: "Temp only.",
        },
      });
      return reviewV2Result(prepared.planId, "One", prepared.expiresAt);
    });
    const executed = await host.execute({
      extensionId: EXTENSION_ID,
      commandId: PREVIEW_COMMAND,
      selection: { fileIds: ["a"] },
    });
    if (!executed.ok || executed.outcome.kind !== "review-required") throw new Error(`setup failed: ${JSON.stringify(executed)}`);
    // The target leaves the index between review and apply.
    live.length = 0;
    const reviewed = host.reviewPlan(executed.outcome.planId);
    if (!reviewed.ok) throw new Error("setup failed");
    const stale = await host.applyPlan(executed.outcome.planId, {
      targets: reviewed.review.targets,
      options: reviewed.review.options,
    });
    expect(stale.ok).toBe(false);
    if (!stale.ok) expect(stale.code).toBe("plan-altered");
  });

  it("denies applies whose permissions lapsed since prepare", async () => {
    const world = fixtureWorld();
    const executed = await world.host.execute({
      extensionId: EXTENSION_ID,
      commandId: PREVIEW_COMMAND,
      input: input(world.grantId),
      selection: { fileIds: ["a"] },
    });
    if (!executed.ok || executed.outcome.kind !== "review-required") throw new Error("setup failed");
    const reviewed = world.host.reviewPlan(executed.outcome.planId);
    if (!reviewed.ok) throw new Error("setup failed");
    world.granted.length = 0;
    const denied = await world.host.applyPlan(executed.outcome.planId, {
      targets: reviewed.review.targets,
      options: reviewed.review.options,
    });
    expect(denied.ok).toBe(false);
    if (!denied.ok) expect(denied.code).toBe("permission-denied");
  });

  it("carries Make Pack preview data through the generic contract", async () => {
    const { host, grantId } = fixtureWorld();
    const executed = await host.execute({
      extensionId: EXTENSION_ID,
      commandId: PREVIEW_COMMAND,
      input: input(grantId),
      selection: { fileIds: ["a", "b"] },
    });
    if (!executed.ok || executed.outcome.kind !== "review-required") throw new Error("setup failed");
    const reviewed = host.reviewPlan(executed.outcome.planId);
    if (!reviewed.ok) throw new Error("setup failed");
    // Consumer (#171) reads sources, names, format, destination,
    // conflicts, missing, and the manifest choice from here.
    expect(reviewed.review.details).toEqual({
      sources: ["a", "b"],
      names: ["a.mp3", "b.mp3"],
      format: "folder",
      destination: "/out",
      conflicts: [],
      missing: [],
      manifestChoice: true,
    });
    expect(reviewed.review.tables[0]?.rows).toEqual([
      ["a", "a.mp3"],
      ["b", "b.mp3"],
    ]);
    expect(reviewed.review.reversibility).toBe("irreversible-files");
    // The payload is JSON-serializable for transport.
    expect(() => JSON.stringify(reviewed.review)).not.toThrow();
    expect(JSON.stringify(reviewed.review)).not.toContain("undefined");
  });
});

describe("plan transport codec", () => {
  it("reviews and applies over HTTP with documented statuses", async () => {
    const { host, grantId } = fixtureWorld();
    const executed = await host.execute({
      extensionId: EXTENSION_ID,
      commandId: PREVIEW_COMMAND,
      input: input(grantId),
      selection: { fileIds: ["a"] },
    });
    if (!executed.ok || executed.outcome.kind !== "review-required") throw new Error("setup failed");
    const planId = executed.outcome.planId;

    const missing = handleV2HttpPlanGet(host, "vplan_missing");
    expect(missing.status).toBe(404);

    const review = handleV2HttpPlanGet(host, planId);
    expect(review.status).toBe(200);
    const reviewBody = review.body as { ok: boolean; review: { targets: unknown; options: unknown } };

    const malformed = await handleV2HttpPlanApply(host, planId, null);
    expect(malformed.status).toBe(400);

    const applied = await handleV2HttpPlanApply(host, planId, {
      targets: reviewBody.review.targets,
      options: reviewBody.review.options,
    });
    expect(applied.status).toBe(200);

    const replay = await handleV2HttpPlanApply(host, planId, {
      targets: reviewBody.review.targets,
      options: reviewBody.review.options,
    });
    expect(replay.status).toBe(400);
  });

  it("maps plan failure codes to documented statuses", () => {
    expect(encodeV2Failure({ ok: false, code: "plan-unknown", message: "x" }).status).toBe(404);
    expect(encodeV2Failure({ ok: false, code: "plan-expired", message: "x" }).status).toBe(400);
    expect(encodeV2Failure({ ok: false, code: "plan-altered", message: "x" }).status).toBe(400);
    expect(encodeV2Failure({ ok: false, code: "plan-consumed", message: "x" }).status).toBe(400);
    expect(encodeV2Failure({ ok: false, code: "review-required", message: "x" }).status).toBe(400);
  });
});
