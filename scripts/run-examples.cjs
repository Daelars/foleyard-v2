#!/usr/bin/env node
/**
 * Run every advertised runnable example from one declaration (#310).
 *
 * `examples/manifest.json` names each example and the runtime that runs
 * it on the primary development platform. This script reconciles that
 * declaration with the `examples/` directory and executes each example,
 * so CI has a single command (`node scripts/run-examples.cjs`) instead of
 * a hardcoded per-example list that can silently omit a new example.
 *
 * Usage:
 *   node scripts/run-examples.cjs          # run every declared example
 *   node scripts/run-examples.cjs --list   # print the discovered examples
 *
 * Exits non-zero when the declaration and the directory disagree, when a
 * declared runtime is unsupported, or when any example exits non-zero.
 */

const path = require("node:path");
const { spawnSync } = require("node:child_process");

const { resolveExamples } = require("./examples.cjs");

const root = path.resolve(__dirname, "..");
const args = process.argv.slice(2);

let examples;
try {
  examples = resolveExamples(root);
} catch (error) {
  console.error(`run-examples: ${error.message}`);
  process.exit(1);
}

if (args.includes("--list")) {
  if (args.length > 1) {
    console.error(`run-examples: unknown argument(s) ${args.join(" ")}`);
    process.exit(1);
  }
  for (const example of examples) console.log(`${example.id}\t${example.runtime}`);
  process.exit(0);
}

if (args.length > 0) {
  console.error(`run-examples: unknown argument(s) ${args.join(" ")}`);
  process.exit(1);
}

let failed = 0;
for (const example of examples) {
  console.log(`run-examples: ${example.id} (${example.runtime})`);
  // shell:true resolves the runtime shim on Windows (`bun.cmd`), where a
  // bare `bun` is not a spawnable executable; both cmd and sh accept the
  // quoted path. Inputs are trusted repository paths.
  const result = spawnSync(`${example.runtime} "${example.runPath}"`, {
    cwd: root,
    stdio: "inherit",
    shell: true,
  });
  if (result.error || result.status !== 0) {
    console.error(
      `run-examples: FAILED ${example.id} (${example.runtime}, exit ${result.status ?? "?"})`,
    );
    failed += 1;
  }
}

if (failed > 0) {
  console.error(`run-examples: ${failed} of ${examples.length} example(s) failed.`);
  process.exit(1);
}
console.log(`run-examples: ${examples.length} example(s) passed.`);
