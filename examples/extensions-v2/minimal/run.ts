#!/usr/bin/env bun
/**
 * Minimal v2 extension example: one global describe command through the
 * real v2 registry and host. No filesystem access, no database, no user
 * files. Imports yard-core only. Exits non-zero on any mismatch.
 *
 * Mirrors the shape `node scripts/scaffold-extension-v2.cjs` generates,
 * minus the package scaffolding: definition data, one pure handler, and
 * direct execution through ExtensionV2Host.
 */

import {
  ExtensionV2Host,
  ExtensionV2Registry,
  immediateV2Result,
  parseCatalog,
  serializeCatalog,
  V2_EXTENSION_API_VERSION,
  type ExtensionV2Definition,
  type V2HandlerResult,
} from "yard-core";

const EXTENSION_ID = "minimal-greeter";
const COMMAND_DESCRIBE = "minimal-greeter.describe";

function createMinimalDefinition(): ExtensionV2Definition {
  return {
    id: EXTENSION_ID,
    name: "Minimal Greeter",
    version: "0.1.0",
    apiVersion: V2_EXTENSION_API_VERSION,
    description: "Smallest runnable v2 extension: one global command, no side effects.",
    permissions: [],
    commands: [
      {
        id: COMMAND_DESCRIBE,
        title: "Describe the invocation",
        description: "Echo the supplied note with the engine-owned run mode.",
        scope: "global",
        input: {
          kind: "object",
          properties: { note: { kind: "string", maxLength: 280 } },
        },
        result: { kind: "string" },
      },
    ],
    settings: [
      {
        id: "minimal-greeter.prefix",
        label: "Prefix",
        description: "Text prepended to the describe output.",
        type: "string",
        defaultValue: "greeter",
      },
    ],
    contributions: [
      { id: "minimal-greeter.palette-describe", type: "command-palette", commandId: COMMAND_DESCRIBE },
      {
        id: "minimal-greeter.settings-entry",
        type: "settings",
        commandId: COMMAND_DESCRIBE,
        title: "Minimal greeter settings",
      },
    ],
    docsRefs: [{ id: "extensions-v2", title: "Extension authoring (v2 API)" }],
  };
}

function describe(context: {
  invocation: { input?: unknown };
  runMode: string;
}): V2HandlerResult {
  const input = (context.invocation.input ?? {}) as { note?: unknown };
  const note = typeof input.note === "string" && input.note.length > 0 ? input.note : "no note";
  return immediateV2Result(`greeter: ${note} (runMode=${context.runMode})`);
}

function fail(message: string): never {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

function createHost(enabled: boolean): ExtensionV2Host {
  const registry = new ExtensionV2Registry();
  registry.register(createMinimalDefinition());
  const host = new ExtensionV2Host({
    registry,
    isEnabled: () => enabled,
    capabilities: [],
    grantedPermissions: () => [],
    ports: {
      getFileById: () => null,
      getFilesByIds: () => [],
    },
  });
  host.registerHandler(EXTENSION_ID, COMMAND_DESCRIBE, (context) =>
    describe({ invocation: context.invocation, runMode: context.runMode }),
  );
  return host;
}

// Case 0: the catalog projection is serializable data, no functions.
const probeRegistry = new ExtensionV2Registry();
probeRegistry.register(createMinimalDefinition());
const roundTripped = parseCatalog(serializeCatalog(probeRegistry.buildCatalog()));
if (roundTripped.entries.map((entry) => entry.id).join(",") !== EXTENSION_ID) {
  fail("catalog round-trip should carry exactly the minimal-greeter entry");
}
console.log("case 0 (serializable catalog): ok");

// Case 1: enabled execution echoes the note with the engine run mode.
const okResult = await createHost(true).execute({
  extensionId: EXTENSION_ID,
  commandId: COMMAND_DESCRIBE,
  input: { note: "hello" },
  selection: { fileIds: [] },
});
if (!okResult.ok || okResult.outcome.kind !== "immediate") {
  fail(`enabled execution should succeed immediate, got ${JSON.stringify(okResult)}`);
}
if (
  typeof okResult.outcome.value !== "string" ||
  !okResult.outcome.value.includes("hello") ||
  !okResult.outcome.value.includes("runMode=direct")
) {
  fail(`enabled execution echoed wrong value: ${JSON.stringify(okResult.outcome.value)}`);
}
console.log(`case 1 (enabled): ok, ${JSON.stringify(okResult.outcome.value)}`);

// Case 2: disabled extension fails with extension-disabled.
const disabledResult = await createHost(false).execute({
  extensionId: EXTENSION_ID,
  commandId: COMMAND_DESCRIBE,
  input: { note: "hello" },
  selection: { fileIds: [] },
});
if (disabledResult.ok || disabledResult.code !== "extension-disabled") {
  fail(`disabled execution should fail extension-disabled, got ${JSON.stringify(disabledResult)}`);
}
console.log(`case 2 (disabled): ok, code ${disabledResult.code}`);

// Case 3: mistyped input fails with input-invalid before any handler runs.
const mistypedResult = await createHost(true).execute({
  extensionId: EXTENSION_ID,
  commandId: COMMAND_DESCRIBE,
  input: { note: 42 },
  selection: { fileIds: [] },
});
if (mistypedResult.ok || mistypedResult.code !== "input-invalid") {
  fail(`mistyped input should fail input-invalid, got ${JSON.stringify(mistypedResult)}`);
}
console.log(`case 3 (mistyped input): ok, code ${mistypedResult.code}`);

console.log("minimal v2 example: all 4 cases passed.");
