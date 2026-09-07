import { describe, expect, it } from "vitest";

import {
  availabilityFailureCode,
  createGreeterFixtureDefinition,
  evaluateV2Availability,
  evaluateV2SnapshotAvailability,
  ExtensionV2Registry,
  type ExtensionV2Command,
  type ExtensionV2Definition,
  type V2AvailabilityContext,
  type V2AvailabilityState,
} from "./index";

// Area: extension v2 R2 (#166). The shared availability evaluator is one
// pure function for renderer display and execution preflight: enabled
// state, scope context, selection, input, unknown capabilities (never
// available), and granted permissions, each with a user-readable reason.

function setup() {
  const registry = new ExtensionV2Registry();
  registry.register(createGreeterFixtureDefinition());
  const definition = registry.get("fixture-greeter")!;
  const command = definition.commands[0]!;
  return { definition, command };
}

function state(overrides?: Partial<V2AvailabilityState>): V2AvailabilityState {
  return {
    enabled: true,
    capabilities: new Set<string>(),
    grantedPermissions: ["library:read"],
    ...overrides,
  };
}

function availability(
  command: ExtensionV2Command,
  definition: ExtensionV2Definition,
  context: V2AvailabilityContext,
  availabilityState: V2AvailabilityState,
) {
  return evaluateV2Availability(definition, command, context, availabilityState);
}

describe("evaluateV2Availability", () => {
  it("marks the fixture greet command available with selection and grants", () => {
    const { definition, command } = setup();
    const result = availability(
      command,
      definition,
      { fileIds: ["a"], input: { name: "Ada" } },
      state(),
    );
    expect(result).toEqual({ available: true });
  });

  it("reports disabled extensions with a user-readable reason", () => {
    const { definition, command } = setup();
    const result = availability(
      command,
      definition,
      { fileIds: ["a"] },
      state({ enabled: false }),
    );
    expect(result.available).toBe(false);
    if (!result.available) {
      expect(result.code).toBe("disabled");
      expect(result.reason).toMatch("disabled");
      expect(result.reason).toMatch(command.title);
    }
  });

  it("requires selection when the command declares it", () => {
    const { definition, command } = setup();
    const result = availability(command, definition, { fileIds: [] }, state());
    expect(result.available).toBe(false);
    if (!result.available) {
      expect(result.code).toBe("selection-required");
      expect(result.reason).toMatch("select");
    }
  });

  it("rejects mismatched scope contexts predictably", () => {
    const { definition } = setup();
    const fileCommand: ExtensionV2Command = {
      id: "fixture-greeter.one",
      title: "One file",
      description: "Single file command.",
      scope: "file",
    };
    const none = availability(fileCommand, definition, { fileIds: [] }, state());
    expect(none.available).toBe(false);
    if (!none.available) expect(none.code).toBe("context-mismatch");

    const folderCommand: ExtensionV2Command = {
      id: "fixture-greeter.folder",
      title: "Folder",
      description: "Folder command.",
      scope: "folder",
    };
    const folder = availability(folderCommand, definition, { fileIds: ["a"] }, state());
    expect(folder.available).toBe(false);
    if (!folder.available) {
      expect(folder.code).toBe("context-mismatch");
      expect(folder.reason).toMatch("folder");
    }

    const collectionCommand: ExtensionV2Command = {
      ...folderCommand,
      id: "fixture-greeter.collection",
      scope: "collection",
    };
    const collection = availability(
      collectionCommand,
      definition,
      { folderPath: "/library" },
      state(),
    );
    expect(collection.available).toBe(false);
    if (!collection.available) expect(collection.code).toBe("context-mismatch");

    const dropCommand: ExtensionV2Command = {
      ...folderCommand,
      id: "fixture-greeter.drop",
      scope: "drop",
    };
    const drop = availability(dropCommand, definition, {}, state());
    expect(drop.available).toBe(false);
    if (!drop.available) expect(drop.code).toBe("selection-empty");
  });

  it("rejects invalid provided input with the schema reason", () => {
    const { definition, command } = setup();
    const result = availability(
      command,
      definition,
      { fileIds: ["a"], input: { name: "Ada", greeting: "yo" } },
      state(),
    );
    expect(result.available).toBe(false);
    if (!result.available) {
      expect(result.code).toBe("input-invalid");
      expect(result.reason).toMatch("one of");
    }
  });

  it("treats unknown capabilities as unavailable with a readable reason", () => {
    const { definition, command } = setup();
    const withCapability: ExtensionV2Command = {
      ...command,
      requiredCapabilities: ["desktop:reveal-native"],
    };
    const missing = availability(
      withCapability,
      definition,
      { fileIds: ["a"], input: { name: "Ada" } },
      state({ capabilities: new Set(["other-cap"]) }),
    );
    expect(missing.available).toBe(false);
    if (!missing.available) {
      expect(missing.code).toBe("capability-unavailable");
      expect(missing.reason).toMatch("desktop:reveal-native");
    }

    const present = availability(
      withCapability,
      definition,
      { fileIds: ["a"], input: { name: "Ada" } },
      state({ capabilities: new Set(["desktop:reveal-native"]) }),
    );
    expect(present).toEqual({ available: true });
  });

  it("denies ungranted permissions by name", () => {
    const { definition, command } = setup();
    const result = availability(
      command,
      definition,
      { fileIds: ["a"], input: { name: "Ada" } },
      state({ grantedPermissions: [] }),
    );
    expect(result.available).toBe(false);
    if (!result.available) {
      expect(result.code).toBe("permission-denied");
      expect(result.reason).toMatch("library:read");
    }
  });

  it("agrees between context and snapshot entry shapes", () => {
    const { definition, command } = setup();
    const availabilityState = state();
    const viaContext = availability(
      command,
      definition,
      { fileIds: ["a"], input: { name: "Ada" } },
      availabilityState,
    );
    const viaSnapshot = evaluateV2SnapshotAvailability(
      definition,
      command,
      { fileIds: ["a"] },
      { name: "Ada" },
      availabilityState,
    );
    expect(viaSnapshot).toEqual(viaContext);
  });

  it("maps denial codes to typed execution failure codes", () => {
    expect(availabilityFailureCode("disabled")).toBe("extension-disabled");
    expect(availabilityFailureCode("context-mismatch")).toBe("context-unsupported");
    expect(availabilityFailureCode("selection-required")).toBe("selection-empty");
    expect(availabilityFailureCode("capability-unavailable")).toBe("capability-unavailable");
    expect(availabilityFailureCode("permission-denied")).toBe("permission-denied");
    expect(availabilityFailureCode("input-invalid")).toBe("input-invalid");
  });
});
