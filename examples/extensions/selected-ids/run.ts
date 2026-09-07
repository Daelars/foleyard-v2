#!/usr/bin/env bun
/**
 * Runnable selected-IDs demo: registers one sound-shelf-like extension with
 * an add-selected command, runs 3 cases, asserts outcomes, prints results.
 * Exits non-zero on mismatch. No filesystem writes.
 */

import {
  YardExtensionHost,
  YardExtensionRegistry,
} from "yard-core";

import {
  COMMAND_DEFINITIONS,
  createSelectedIdsExtension,
  describeSelectedIdsCommand,
  EXTENSION_ID,
  InMemorySelectedIdsStore,
} from "./index";

const COMMAND_ID = COMMAND_DEFINITIONS[0]!.id;

function fail(message: string): never {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

function assert(condition: unknown, message: string): void {
  if (!condition) fail(message);
}

const registry = new YardExtensionRegistry();
const store = new InMemorySelectedIdsStore();
registry.register(createSelectedIdsExtension(store));

let enabled = true;
const host = new YardExtensionHost({
  registry,
  isEnabled: () => enabled,
  getSettingValue: (_extensionId, _settingId, defaultValue) => defaultValue,
});

console.log(
  `command metadata: ${JSON.stringify(describeSelectedIdsCommand())}`,
);

// Case 1: enabled execution returns the supplied IDs.
const supplied = ["file-a", "file-b"];
const okResult = await host.execute<string[]>({
  extensionId: EXTENSION_ID,
  commandId: COMMAND_ID,
  selection: { fileIds: supplied },
});
assert(okResult.ok, `enabled execution should succeed, got ${JSON.stringify(okResult)}`);
if (okResult.ok && okResult.type === "value") {
  assert(
    JSON.stringify(okResult.value) === JSON.stringify(supplied),
    `enabled execution should return supplied IDs, got ${JSON.stringify(okResult.value)}`,
  );
  console.log(`case 1 (enabled): ok, returned ${JSON.stringify(okResult.value)}`);
} else {
  fail(`enabled execution returned unexpected outcome ${JSON.stringify(okResult)}`);
}

// Case 2: disabled extension fails with extension-disabled.
enabled = false;
const disabledResult = await host.execute({
  extensionId: EXTENSION_ID,
  commandId: COMMAND_ID,
  selection: { fileIds: supplied },
});
assert(!disabledResult.ok, "disabled execution should fail");
if (!disabledResult.ok) {
  assert(
    disabledResult.reason === "extension-disabled",
    `disabled execution reason should be extension-disabled, got ${disabledResult.reason}`,
  );
  console.log(`case 2 (disabled): ok, reason ${disabledResult.reason}`);
}

// Case 3: empty selection fails with validation-failed.
enabled = true;
const emptyResult = await host.execute({
  extensionId: EXTENSION_ID,
  commandId: COMMAND_ID,
  selection: { fileIds: [] },
});
assert(!emptyResult.ok, "empty selection should fail");
if (!emptyResult.ok) {
  assert(
    emptyResult.reason === "validation-failed",
    `empty selection reason should be validation-failed, got ${emptyResult.reason}`,
  );
  console.log(`case 3 (empty selection): ok, reason ${emptyResult.reason}`);
}

console.log("selected-ids example: all 3 cases passed.");
