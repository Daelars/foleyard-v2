// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  immediateV2Result,
  MAX_V2_STATE_BYTES,
  V2_EXTENSION_API_VERSION,
  type ExtensionV2Definition,
  type V2CommandHandler,
} from "@yard-core";
import { deferred } from "@/test/fixtures";

// Area: #265. Production handlers reach workflow state through the
// documented versioned store: the state slice of `createV2OperationServices`
// is the bounded, migration-aware `V2WorkflowStateStore`, and the store is
// cached once per extension on the process-wide runtime (#264) so two
// concurrent jobs share one serialization queue. This drives the real
// production composition (`getAppV2Host()` → `createOperations`) with only
// the settings/state rows substituted, the same substitution the bundled
// tools' own suites make.

const stateRows = new Map<string, unknown>();

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
    createV2ExtensionStatePorts: () => ({
      readAll: (extensionId: string) =>
        (stateRows.get(`v2state:${extensionId}`) as Record<string, unknown> | undefined) ?? {},
      writeAll: (extensionId: string, state: Record<string, unknown>) => {
        stateRows.set(`v2state:${extensionId}`, state);
      },
    }),
  };
});

import {
  getAppV2Host,
  getV2Registry,
  registerV2Extension,
  setV2ExtensionEnabled,
} from "@/lib/extensions-v2/host";
import { setV2Approval } from "@/lib/extensions-v2/policy";
import { getV2Runtime } from "@/lib/extensions-v2/runtime";

const EXTENSION_ID = "workflow-state-probe";
const APPEND = `${EXTENSION_ID}.append`;
const BIG_KEY = `${EXTENSION_ID}.big-key`;
const BIG_VALUE = `${EXTENSION_ID}.big-value`;
const MIGRATE = `${EXTENSION_ID}.migrate`;
const STATE_KEY = `v2state:${EXTENSION_ID}`;

function definition(): ExtensionV2Definition {
  return {
    id: EXTENSION_ID,
    name: "Workflow State Probe",
    version: "1.0.0",
    apiVersion: V2_EXTENSION_API_VERSION,
    description: "Proves versioned, bounded, concurrency-safe workflow state in production.",
    // State is namespaced, not permissioned: the probe needs none.
    permissions: [],
    commands: [
      {
        id: APPEND,
        title: "Append",
        description: "Append one label to the bounded history via an atomic update.",
        scope: "global",
        input: {
          kind: "object",
          properties: { label: { kind: "string" } },
          required: ["label"],
        },
        result: {
          kind: "object",
          properties: { count: { kind: "number" } },
          required: ["count"],
        },
      },
      {
        id: BIG_KEY,
        title: "Oversized key",
        description: "Attempt an over-limit state key.",
        scope: "global",
        result: {
          kind: "object",
          properties: { ok: { kind: "boolean" } },
          required: ["ok"],
        },
      },
      {
        id: BIG_VALUE,
        title: "Oversized value",
        description: "Attempt an over-limit state value.",
        scope: "global",
        result: {
          kind: "object",
          properties: { ok: { kind: "boolean" } },
          required: ["ok"],
        },
      },
      {
        id: MIGRATE,
        title: "Migrate",
        description: "Run the declared versioned migration path.",
        scope: "global",
        result: {
          kind: "object",
          properties: { from: { kind: "number" }, to: { kind: "number" } },
          required: ["from", "to"],
        },
      },
    ],
  };
}

// Gates the first writer inside its updater so the second writer is
// guaranteed to arrive while the first holds the store's critical section.
let firstStarted: ReturnType<typeof deferred<void>>;
let releaseFirst: ReturnType<typeof deferred<void>>;

const appendHandler: V2CommandHandler = async (context) => {
  const label = (context.invocation.input as { label: string }).label;
  await context.operations.state.update("history", async (current) => {
    if (label === "first") {
      firstStarted.resolve();
      await releaseFirst.promise;
    }
    return [...(Array.isArray(current) ? current : []), label];
  });
  const history = context.operations.state.read("history");
  return immediateV2Result({ count: Array.isArray(history) ? history.length : 0 });
};

const bigKeyHandler: V2CommandHandler = (context) => {
  context.operations.state.write("k".repeat(300), 1);
  return immediateV2Result({ ok: true });
};

const bigValueHandler: V2CommandHandler = (context) => {
  context.operations.state.write("history", "x".repeat(MAX_V2_STATE_BYTES + 1));
  return immediateV2Result({ ok: true });
};

const migrateHandler: V2CommandHandler = (context) => {
  const moved = context.operations.state.migrateTo(2, {
    0: (data) => ({ ...data, renamed: data.name }),
    1: (data) => ({ ...data, step: 2 }),
  });
  return immediateV2Result({ from: moved.from, to: moved.to });
};

function ensureProbe(): void {
  if (!getV2Registry().get(EXTENSION_ID)) {
    registerV2Extension(definition());
  }
  const host = getAppV2Host();
  host.registerHandler(EXTENSION_ID, APPEND, appendHandler);
  host.registerHandler(EXTENSION_ID, BIG_KEY, bigKeyHandler);
  host.registerHandler(EXTENSION_ID, BIG_VALUE, bigValueHandler);
  host.registerHandler(EXTENSION_ID, MIGRATE, migrateHandler);
}

async function execute(commandId: string, input?: unknown) {
  return getAppV2Host().execute({
    extensionId: EXTENSION_ID,
    commandId,
    ...(input !== undefined ? { input } : {}),
    selection: { fileIds: [] },
  });
}

function storedRow(): Record<string, unknown> {
  return stateRows.get(STATE_KEY) as Record<string, unknown>;
}

describe("extension v2 workflow state through the production host", () => {
  beforeEach(async () => {
    stateRows.clear();
    // One cached store per extension on the process-wide runtime: drop it
    // so each test starts from a clean envelope.
    getV2Runtime().workflowStates.clear();
    firstStarted = deferred<void>();
    releaseFirst = deferred<void>();
    ensureProbe();
    await setV2ExtensionEnabled(EXTENSION_ID, true);
    setV2Approval(EXTENSION_ID, []);
  });

  afterEach(async () => {
    await setV2ExtensionEnabled(EXTENSION_ID, false);
  });

  it("persists state as a versioned envelope, not a bare blob", async () => {
    const result = await execute(APPEND, { label: "only" });
    expect(result).toMatchObject({ ok: true, outcome: { kind: "immediate" } });
    expect(storedRow()).toMatchObject({
      __v2envelope: true,
      schemaVersion: 0,
      data: { history: ["only"] },
    });
  });

  it("rejects an oversized key or value before anything is persisted", async () => {
    await execute(APPEND, { label: "keep" });
    const before = JSON.stringify(storedRow());

    const oversizedKey = await execute(BIG_KEY);
    expect(oversizedKey).toMatchObject({ ok: false, code: "input-invalid" });
    expect(JSON.stringify(storedRow())).toBe(before);

    const oversizedValue = await execute(BIG_VALUE);
    expect(oversizedValue).toMatchObject({ ok: false, code: "input-invalid" });
    expect(JSON.stringify(storedRow())).toBe(before);
  });

  it("walks the declared migration path over a stored legacy blob", async () => {
    // A blob written before this ticket: unversioned, read as version 0.
    stateRows.set(STATE_KEY, { name: "old" });

    const result = await execute(MIGRATE);
    expect(result).toMatchObject({
      ok: true,
      outcome: { kind: "immediate", value: { from: 0, to: 2 } },
    });
    expect(storedRow()).toMatchObject({
      __v2envelope: true,
      schemaVersion: 2,
      data: { name: "old", renamed: "old", step: 2 },
    });
  });

  it("does not lose an update when two invocations interleave their read-modify-write", async () => {
    // Job-mode handlers receive operation services from this same
    // `createOperations` binding, so this interleaving is the production
    // concurrency shape.
    const first = execute(APPEND, { label: "first" });
    // The first writer is now inside its updater, holding the store.
    await firstStarted.promise;
    const second = execute(APPEND, { label: "second" });
    releaseFirst.resolve();
    const [firstResult, secondResult] = await Promise.all([first, second]);

    expect(firstResult).toMatchObject({ ok: true });
    expect(secondResult).toMatchObject({ ok: true });
    // Both contributions survive: the second writer ran after the first
    // committed instead of clobbering it with a stale snapshot.
    expect(storedRow()).toMatchObject({
      __v2envelope: true,
      data: { history: ["first", "second"] },
    });
  });
});
