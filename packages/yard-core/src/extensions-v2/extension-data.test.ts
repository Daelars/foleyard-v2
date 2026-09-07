import { describe, expect, it } from "vitest";

import {
  MAX_V2_STATE_BYTES,
  MAX_V2_STATE_KEYS,
  V2AuthoredSettingsStore,
  V2EventBus,
  V2OperationError,
  V2WorkflowStateStore,
  type ExtensionV2Setting,
  type V2ExtensionStatePorts,
  type V2SettingsPorts,
} from "./index";

// Area: extension v2 R7 (#169). Extension-scoped settings (declaration
// validation, defaults, reset, corrupt-load diagnosis) and workflow
// state (versioning, transactional migrations, bounds, persist-before-
// notify). Job records stay host-owned and separate.

const DECLARATIONS: ExtensionV2Setting[] = [
  { id: "fixture-greeter.formality", label: "Formality", type: "enum", defaultValue: "casual", options: [{ label: "Casual", value: "casual" }, { label: "Formal", value: "formal" }] },
  { id: "fixture-greeter.verbose", label: "Verbose", type: "boolean", defaultValue: false },
  { id: "fixture-greeter.nickname", label: "Nickname", type: "string", defaultValue: "packer" },
];

function memorySettings(seed?: Map<string, unknown>): { ports: V2SettingsPorts; rows: Map<string, unknown> } {
  const rows = seed ?? new Map<string, unknown>();
  return {
    rows,
    ports: {
      readRaw: (key) => rows.get(key),
      writeRaw: (key, value) => {
        rows.set(key, value);
      },
    },
  };
}

function memoryState(seed?: Map<string, Record<string, unknown>>): { ports: V2ExtensionStatePorts; blobs: Map<string, Record<string, unknown>> } {
  const blobs = seed ?? new Map<string, Record<string, unknown>>();
  return {
    blobs,
    ports: {
      readAll: (extensionId) => blobs.get(extensionId) ?? {},
      writeAll: (extensionId, state) => {
        blobs.set(extensionId, state);
      },
    },
  };
}

describe("V2AuthoredSettingsStore", () => {
  it("returns defaults, validates writes, and resets to declared defaults", () => {
    const { ports } = memorySettings();
    const store = new V2AuthoredSettingsStore("fixture-greeter", DECLARATIONS, ports);
    expect(store.get("fixture-greeter.formality")).toBe("casual");
    store.set("fixture-greeter.formality", "formal");
    expect(store.get("fixture-greeter.formality")).toBe("formal");
    expect(() => store.set("fixture-greeter.formality", "slang")).toThrowError(V2OperationError);
    expect(() => store.set("fixture-greeter.unknown", true)).toThrowError(/not declared/);
    expect(() => store.set("fixture-greeter.verbose", "yes")).toThrowError(/must be a boolean/);
    store.reset("fixture-greeter.formality");
    expect(store.get("fixture-greeter.formality")).toBe("casual");
    store.set("fixture-greeter.verbose", true);
    store.reset();
    expect(store.getAll()).toEqual({
      "fixture-greeter.formality": "casual",
      "fixture-greeter.verbose": false,
      "fixture-greeter.nickname": "packer",
    });
  });

  it("falls back to defaults for corrupt persisted rows and reports a diagnosis", () => {
    const rows = new Map<string, unknown>([
      ["extension:fixture-greeter:setting:fixture-greeter.formality", "slang"],
    ]);
    const { ports } = memorySettings(rows);
    const store = new V2AuthoredSettingsStore("fixture-greeter", DECLARATIONS, ports);
    expect(store.get("fixture-greeter.formality")).toBe("casual");
    const diagnosis = store.diagnose();
    expect(diagnosis).toHaveLength(1);
    expect(diagnosis[0]?.reason).toMatch("formality");
    // Repairing the row clears the diagnosis.
    store.set("fixture-greeter.formality", "formal");
    expect(store.diagnose()).toEqual([]);
  });

  it("persists before notifying subscribers", () => {
    const { ports, rows } = memorySettings();
    const bus = new V2EventBus();
    const observed: Array<{ sequence: number; value: unknown }> = [];
    bus.subscribe("settings-changed", (payload) => {
      observed.push({
        sequence: payload.sequence,
        value: rows.get("extension:fixture-greeter:setting:fixture-greeter.verbose"),
      });
    });
    const store = new V2AuthoredSettingsStore("fixture-greeter", DECLARATIONS, ports, { events: bus });
    store.set("fixture-greeter.verbose", true);
    // The subscriber's reread already sees the write that triggered the event.
    expect(observed).toEqual([{ sequence: 1, value: true }]);
  });
});

describe("V2WorkflowStateStore", () => {
  it("isolates two extensions by namespace", () => {
    const { ports } = memoryState();
    const first = new V2WorkflowStateStore("ext-a", ports);
    const second = new V2WorkflowStateStore("ext-b", ports);
    first.write("draft", { step: 1 });
    expect(second.read("draft")).toBeUndefined();
    expect(second.readAll()).toEqual({});
    second.write("draft", { step: 2 });
    expect(first.read("draft")).toEqual({ step: 1 });
  });

  it("reads legacy unversioned blobs as version 0", () => {
    const blobs = new Map<string, Record<string, unknown>>([["ext-a", { draft: 1 }]]);
    const { ports } = memoryState(blobs);
    const store = new V2WorkflowStateStore("ext-a", ports);
    expect(store.status().schemaVersion).toBe(0);
    expect(store.read("draft")).toBe(1);
  });

  it("migrates transactionally and preserves data on failure", () => {
    const { ports } = memoryState();
    const store = new V2WorkflowStateStore("ext-a", ports);
    store.write("draft", { step: 1 });
    const moved = store.migrateTo(2, (data) => ({ ...data, migrated: true }));
    expect(moved).toEqual({ from: 0, to: 2 });
    expect(store.status()).toMatchObject({ schemaVersion: 2, disabled: false });

    const before = JSON.stringify(store.readAll());
    expect(() =>
      store.migrateTo(3, () => {
        throw new Error("cannot map old shape");
      }),
    ).toThrowError(/prior version-2 data is preserved/);
    // Prior data is byte-identical; the store is disabled with a diagnosis.
    expect(JSON.stringify(store.readAll())).toBe(before);
    expect(store.status().disabled).toBe(true);
    expect(store.status().diagnosis).toMatch("cannot map old shape");
    expect(() => store.write("draft", 2)).toThrowError(/Cannot write state/);
    // Reset recovers; a corrected migration then succeeds.
    store.reset();
    expect(store.status()).toMatchObject({ schemaVersion: 0, disabled: false });
    store.migrateTo(1, (data) => ({ ...data }));
    expect(store.status().schemaVersion).toBe(1);
  });

  it("rejects unserializable values and enforces key/byte bounds", () => {
    const { ports } = memoryState();
    const store = new V2WorkflowStateStore("ext-a", ports);
    expect(() => store.write("fn", () => {})).toThrowError(/JSON-serializable/);
    const many: Record<string, unknown> = {};
    for (let index = 0; index < MAX_V2_STATE_KEYS + 1; index += 1) many[`k${index}`] = index;
    expect(() => store.migrateTo(1, () => many)).toThrowError(/limit is/);
    expect(store.status().disabled).toBe(true);
    store.reset();
    expect(() => store.write("big", "x".repeat(MAX_V2_STATE_BYTES + 1))).toThrowError(/per-extension limit/);
  });

  it("persists before notifying subscribers", () => {
    const { ports } = memoryState();
    const bus = new V2EventBus();
    const store = new V2WorkflowStateStore("ext-a", ports, { events: bus });
    const observed: unknown[] = [];
    bus.subscribe("state-changed", () => {
      observed.push(store.read("draft"));
    });
    store.write("draft", { step: 1 });
    expect(observed).toEqual([{ step: 1 }]);
  });
});
