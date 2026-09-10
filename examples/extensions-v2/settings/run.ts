#!/usr/bin/env bun
/**
 * Settings + contribution example: declare one setting and one sidebar
 * contribution, resolve the contribution through the shared availability
 * evaluator, and execute the contributed command using the stored value.
 * No database, no filesystem, no user files: settings live in an in-memory
 * port. Imports yard-core only. Exits non-zero on any mismatch.
 */

import {
  buildEffectiveV2Catalog,
  ExtensionV2Host,
  ExtensionV2Registry,
  immediateV2Result,
  resolveV2PointContributions,
  V2AuthoredSettingsStore,
  V2_EXTENSION_API_VERSION,
  type ExtensionV2Definition,
} from "yard-core";

const EXTENSION_ID = "settings-demo";
const COMMAND = "settings-demo.describe";
const SETTING = "settings-demo.label";
const CONTRIBUTION = "settings-demo.sidebar";

function createDefinition(): ExtensionV2Definition {
  return {
    id: EXTENSION_ID,
    name: "Settings Demo",
    version: "0.1.0",
    apiVersion: V2_EXTENSION_API_VERSION,
    description: "Demonstrates authored settings driving a resolved contribution.",
    permissions: ["library:read"],
    commands: [
      {
        id: COMMAND,
        title: "Describe with the configured label",
        description: "Returns the declared label setting.",
        scope: "global",
        result: { kind: "string" },
      },
    ],
    settings: [
      {
        id: SETTING,
        label: "Label",
        description: "Text returned by the describe command.",
        type: "string",
        defaultValue: "unlabeled",
      },
    ],
    contributions: [
      {
        id: CONTRIBUTION,
        type: "sidebar",
        commandId: COMMAND,
        title: "Settings demo",
      },
    ],
    docsRefs: [{ id: "settings", title: "Settings" }],
  };
}

function fail(message: string): never {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

const definition = createDefinition();
const rows = new Map<string, unknown>();
const store = new V2AuthoredSettingsStore(EXTENSION_ID, definition.settings!, {
  readRaw: (key) => rows.get(key),
  writeRaw: (key, value) => rows.set(key, value),
});

// Case 0: an unwritten setting reads its declared default.
if (store.get(SETTING) !== "unlabeled") {
  fail(`default read should be "unlabeled", got ${JSON.stringify(store.get(SETTING))}`);
}
console.log(`case 0 (default): ok, ${JSON.stringify(store.get(SETTING))}`);

// Case 1: a valid write persists; a mistyped write is rejected and changes nothing.
store.set(SETTING, "kick");
if (store.get(SETTING) !== "kick") {
  fail(`stored setting should read back "kick", got ${JSON.stringify(store.get(SETTING))}`);
}
let rejected = false;
try {
  store.set(SETTING, 42);
} catch (error) {
  rejected = error instanceof Error && /string/i.test(error.message);
}
if (!rejected || store.get(SETTING) !== "kick") {
  fail("a non-string write must be rejected without changing the stored value");
}
console.log(`case 1 (validated write): ok, ${JSON.stringify(store.get(SETTING))}`);

// Case 2: the contribution resolves only when enabled and approved.
const registry = new ExtensionV2Registry();
registry.register(definition);
const unapprovedCatalog = buildEffectiveV2Catalog(registry, () => []);
const approvedCatalog = buildEffectiveV2Catalog(registry, () => ["library:read"]);
const resolve = (
  catalog: ReturnType<typeof buildEffectiveV2Catalog>,
  enabled: boolean,
) =>
  resolveV2PointContributions(
    catalog.entries,
    "sidebar",
    { fileIds: [] },
    {
      isEnabled: () => enabled,
      capabilities: new Set<string>(),
      grantedPermissions: (id) =>
        catalog.entries.find((entry) => entry.id === id)?.permissions ?? [],
    },
  );
const unapproved = resolve(unapprovedCatalog, true);
if (unapproved.length !== 1 || unapproved[0]!.availability.available) {
  fail(`an unapproved contribution must resolve unavailable, got ${JSON.stringify(unapproved)}`);
}
if (
  !unapproved[0]!.availability.available &&
  unapproved[0]!.availability.code !== "permission-denied"
) {
  fail(`unapproved denial should be permission-denied, got ${unapproved[0]!.availability.code}`);
}
const available = resolve(approvedCatalog, true);
if (
  available.length !== 1 ||
  available[0]!.contributionId !== CONTRIBUTION ||
  !available[0]!.availability.available
) {
  fail(`approved resolution should return the sidebar item, got ${JSON.stringify(available)}`);
}
if (resolve(approvedCatalog, false).length !== 0) {
  fail("a disabled extension must contribute no sidebar items");
}
console.log("case 2 (contribution resolution): ok, available when enabled + approved");

// Case 3: executing the contributed command uses the stored setting.
const host = new ExtensionV2Host({
  registry,
  isEnabled: () => true,
  capabilities: [],
  grantedPermissions: () => ["library:read"],
  ports: {
    getFileById: () => null,
    getFilesByIds: () => [],
  },
});
host.registerHandler(EXTENSION_ID, COMMAND, () =>
  immediateV2Result(`label: ${String(store.get(SETTING))}`),
);

const first = await host.execute({
  extensionId: EXTENSION_ID,
  commandId: COMMAND,
  selection: { fileIds: [] },
});
if (!first.ok || first.outcome.kind !== "immediate" || first.outcome.value !== "label: kick") {
  fail(`execution should use the stored setting, got ${JSON.stringify(first)}`);
}

store.set(SETTING, "snare");
const second = await host.execute({
  extensionId: EXTENSION_ID,
  commandId: COMMAND,
  selection: { fileIds: [] },
});
if (!second.ok || second.outcome.kind !== "immediate" || second.outcome.value !== "label: snare") {
  fail(`execution should follow the updated setting, got ${JSON.stringify(second)}`);
}
console.log(`case 3 (setting drives execution): ok, ${JSON.stringify(second.outcome.value)}`);

// Case 4: reset restores the declared default.
store.reset(SETTING);
if (store.get(SETTING) !== "unlabeled") {
  fail(`reset should restore the default, got ${JSON.stringify(store.get(SETTING))}`);
}
console.log("case 4 (reset): ok, unlabeled");

console.log("settings + contribution example: all 5 cases passed.");
