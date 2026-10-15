// @vitest-environment node
import fs from "node:fs";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import {
  immediateV2Result,
  reviewV2Result,
  V2_EXTENSION_API_VERSION,
  type ExtensionV2Definition,
  type V2CommandHandler,
} from "@yard-core";
import { callRoute, createScratchLibrary, type ScratchLibrary } from "@/test/fixtures";

// Area: #264. One process-owned v2 runtime. Next compiles each route
// into its own bundle, which used to fork the registry, host, plan
// manager, event bus, and grant stores. This file simulates those
// bundles with vi.resetModules() between route imports and proves the
// shared-runtime contract end to end: a plan prepared through execute is
// readable and applicable through the plan routes, a grant issued
// through the grants route authorizes execution through the execute
// route, and a subscription observes an event emitted by another
// bundle. Everything is asserted through the routes and public
// accessors — no test reaches into a global key by name.

const stateRows = new Map<string, unknown>();
const libraryRoots: string[] = [];

vi.mock("@/lib/extensions-v2/settings-state", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@/lib/extensions-v2/settings-state")>();
  return {
    ...original,
    readV2SettingsRow: (key: string) => stateRows.get(key),
    writeV2SettingsRow: (key: string, value: unknown) => {
      stateRows.set(key, value);
    },
    deleteV2SettingsRow: (key: string) => {
      stateRows.delete(key);
    },
    listV2SettingsKeys: (prefix: string) =>
      [...stateRows.keys()].filter((key) => key.startsWith(prefix)),
  };
});

vi.mock("@/lib/db", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/db")>();
  return {
    ...original,
    getFiles: () => [],
    getFileById: () => null,
    getFilesByIds: () => [],
    getLibraryRoots: () => libraryRoots,
    collectionExists: () => true,
  };
});

const PROBE_ID = "shared-runtime-probe";
const PREPARE_COMMAND = `${PROBE_ID}.prepare`;
const WRITE_COMMAND = `${PROBE_ID}.write`;

function probeDefinition(): ExtensionV2Definition {
  return {
    id: PROBE_ID,
    name: "Shared Runtime Probe",
    version: "1.0.0",
    apiVersion: V2_EXTENSION_API_VERSION,
    description: "Proves one process-wide v2 runtime across route bundles.",
    permissions: ["files:write"],
    commands: [
      {
        id: PREPARE_COMMAND,
        title: "Prepare",
        description: "Prepare a reviewed plan.",
        scope: "global",
        result: {
          kind: "object",
          properties: { applied: { kind: "boolean" } },
          required: ["applied"],
        },
      },
      {
        id: WRITE_COMMAND,
        title: "Write",
        description: "Write an authorized output file.",
        scope: "global",
        input: {
          kind: "object",
          properties: { grantId: { kind: "string" } },
          required: ["grantId"],
        },
        result: {
          kind: "object",
          properties: { path: { kind: "string" } },
          required: ["path"],
        },
      },
    ],
  };
}

const GRANTED_PERMISSIONS = ["files:write"] as const;

function prepareHandler(context: Parameters<V2CommandHandler>[0]) {
  if (context.plan) return immediateV2Result({ applied: true });
  const { planId, expiresAt } = context.operations.plans.prepare({
    targets: { fileIds: [] },
    destructive: true,
    preview: {
      summary: "Probe plan",
      tables: [],
      notices: [],
      reversibility: "reversible-app-change",
      reversibilityNote: "probe only",
    },
  });
  return reviewV2Result(planId, "Probe plan", expiresAt);
}

const writeHandler: V2CommandHandler = async (context) => {
  const input = context.invocation.input as { grantId: string };
  const written = await context.operations.files.createOutputText(
    input.grantId,
    "probe-output.txt",
    "shared runtime",
  );
  return immediateV2Result({ path: written.path });
};

// Each loader resets the module registry first, so the returned module
// is a fresh "route bundle" that shares nothing with the previous one
// except process state.
async function importHost() {
  vi.resetModules();
  return import("@/lib/extensions-v2/host");
}
async function importPolicy() {
  vi.resetModules();
  return import("@/lib/extensions-v2/policy");
}
async function importEvents() {
  vi.resetModules();
  return import("@/lib/extensions-v2/events");
}
async function importExecuteRoute() {
  vi.resetModules();
  return import("@/app/api/extensions-v2/execute/route");
}
async function importGrantsRoute() {
  vi.resetModules();
  return import("@/app/api/extensions-v2/grants/route");
}
async function importDesktopGrantsRoute() {
  vi.resetModules();
  return import("@/app/api/desktop/grants/route");
}
async function importPlanRoute() {
  vi.resetModules();
  return import("@/app/api/extensions-v2/plans/[planId]/route");
}
async function importPlanApplyRoute() {
  vi.resetModules();
  return import("@/app/api/extensions-v2/plans/[planId]/apply/route");
}

async function registerProbe(): Promise<void> {
  const host = await importHost();
  if (!host.getV2Registry().get(PROBE_ID)) {
    host.getV2Registry().register(probeDefinition());
  }
  host.getAppV2Host().registerHandler(PROBE_ID, PREPARE_COMMAND, prepareHandler);
  host.getAppV2Host().registerHandler(PROBE_ID, WRITE_COMMAND, writeHandler);
  await host.setV2ExtensionEnabled(PROBE_ID, true);
  const policy = await importPolicy();
  policy.setV2Approval(PROBE_ID, [...GRANTED_PERMISSIONS]);
}

let scratch: ScratchLibrary | null = null;

beforeEach(() => {
  stateRows.clear();
});

afterEach(async () => {
  vi.unstubAllEnvs();
  const host = await importHost();
  try {
    host.unregisterV2Extension(PROBE_ID);
  } catch {
    // absence is explicit, not fatal
  }
  const policy = await importPolicy();
  policy.revokeV2Approval(PROBE_ID);
  stateRows.clear();
  scratch?.dispose();
  scratch = null;
});

describe("shared v2 runtime across route bundles", () => {
  it("reads and applies a plan prepared through the execute route from the plan routes", async () => {
    await registerProbe();

    const execute = await importExecuteRoute();
    const prepared = await callRoute(execute.POST, {
      url: "http://localhost/api/extensions-v2/execute",
      body: { extensionId: PROBE_ID, commandId: PREPARE_COMMAND, selection: { fileIds: [] } },
    });
    expect(prepared.status).toBe(200);
    const outcome = (prepared.body as { outcome: { kind: string; planId: string } }).outcome;
    expect(outcome.kind).toBe("review-required");

    // A different bundle reads the same plan from the same plan manager.
    const planRoute = await importPlanRoute();
    const reviewed = await planRoute.GET(
      new NextRequest(`http://localhost/api/extensions-v2/plans/${outcome.planId}`),
      { params: Promise.resolve({ planId: outcome.planId }) },
    );
    expect(reviewed.status).toBe(200);
    const reviewBody = (await reviewed.json()) as {
      ok: boolean;
      review: { destructive: boolean; targets: unknown; options: unknown };
    };
    expect(reviewBody.ok).toBe(true);
    expect(reviewBody.review.destructive).toBe(true);

    // And a third bundle applies it, echoing the review byte-identically.
    const applyRoute = await importPlanApplyRoute();
    const applied = await applyRoute.POST(
      new NextRequest(`http://localhost/api/extensions-v2/plans/${outcome.planId}/apply`, {
        method: "POST",
        body: JSON.stringify({
          targets: reviewBody.review.targets,
          options: reviewBody.review.options,
        }),
      }),
      { params: Promise.resolve({ planId: outcome.planId }) },
    );
    expect(applied.status).toBe(200);
    expect(await applied.json()).toMatchObject({
      ok: true,
      outcome: { kind: "immediate", value: { applied: true } },
    });
  });

  it("authorizes execution with a grant issued through the grants route", async () => {
    await registerProbe();
    scratch = createScratchLibrary();
    const destination = scratch.directory("out");
    vi.stubEnv("FOLEYARD_GRANT_SECRET", "shared-runtime-secret");

    // One bundle mints the picker proof the desktop picker would return.
    const desktopGrants = await importDesktopGrantsRoute();
    const picked = await callRoute<{ ok: boolean; proof: string }>(desktopGrants.POST, {
      url: "http://localhost/api/desktop/grants",
      headers: { "x-foleyard-grant-secret": "shared-runtime-secret" },
      body: { path: destination, extensionId: PROBE_ID, grantKind: "destination" },
    });
    expect(picked.status).toBe(200);

    // A different bundle spends it: the proof store is process-wide like the
    // grant store beside it.
    const grants = await importGrantsRoute();
    const issued = await callRoute(grants.POST, {
      url: "http://localhost/api/extensions-v2/grants",
      body: { extensionId: PROBE_ID, proof: picked.body.proof },
    });
    expect(issued.status).toBe(200);
    const { grantId } = issued.body as { grantId: string };

    // A different bundle executes against the grant the grants route issued.
    const execute = await importExecuteRoute();
    const executed = await callRoute(execute.POST, {
      url: "http://localhost/api/extensions-v2/execute",
      body: {
        extensionId: PROBE_ID,
        commandId: WRITE_COMMAND,
        input: { grantId },
        selection: { fileIds: [] },
      },
    });
    expect(executed.status).toBe(200);
    expect(executed.body).toMatchObject({ ok: true, outcome: { kind: "immediate" } });
    expect(fs.existsSync(path.join(destination, "probe-output.txt"))).toBe(true);
  });

  it("delivers a server-emitted event to the subscription that owns it", async () => {
    // The subscription is created in one bundle (the renderer adapter).
    const subscriber = await importEvents();
    const seen: Array<{ type: string; extensionId: string }> = [];
    const unsubscribe = subscriber.getV2Events().subscribe("*", (payload) => {
      seen.push({ type: payload.type, extensionId: payload.extensionId });
    });

    // The emit happens in a different bundle (the approval policy write).
    await registerProbe();

    unsubscribe();
    expect(seen).toContainEqual({ type: "approvals-changed", extensionId: PROBE_ID });
  });
});
