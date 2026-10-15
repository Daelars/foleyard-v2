// Guards the expected-to-fail regression set (#133, #304).
//
// Each it.fails() in the test suite pins a live defect and carries its ledger
// id in the title. This checker maps pinned tests to the structured entries in
// docs/expected-failures.md by id, so deleting or swapping one is detected
// instead of hidden by a count. Fixing a defect flips its test to it() and
// removes its entry in the same PR; both sides move together.
//
// Severity is explicit. Entries tagged `data-loss` are release blockers: they
// are reported here and `--release` (used by the release build gate) refuses to
// continue while any are pinned.
//
// Usage: node scripts/check-expected-failures.cjs [--release]

const path = require("node:path");

const {
  LEDGER_PATH,
  evaluateRepository,
} = require("./lib/expected-failures.cjs");

const root = path.resolve(__dirname, "..");
const release = process.argv.includes("--release");

const result = evaluateRepository(root);

if (result.errors.length > 0) {
  console.error(`expected-failures: FAILED with ${result.errors.length} problem(s):`);
  for (const error of result.errors) console.error(`  - ${error}`);
  process.exit(1);
}

if (release && result.blockers.length > 0) {
  console.error(
    `expected-failures: release blocked by ${result.blockers.length} data-loss finding(s): ${result.blockers
      .map((entry) => `${entry.id} (${entry.area})`)
      .join(", ")}.`,
  );
  console.error(
    "Fix the finding, flip its test to it() and remove its ledger entry before releasing.",
  );
  process.exit(1);
}

if (result.blockers.length > 0) {
  console.warn(
    `expected-failures: ${result.blockers.length} release-blocking data-loss finding(s) pinned: ${result.blockers
      .map((entry) => entry.id)
      .join(", ")}.`,
  );
}

console.log(
  `expected-failures: ${result.tests.length} pinned regression(s) mapped to ${result.entries.length} ledger entr${
    result.entries.length === 1 ? "y" : "ies"
  } in ${LEDGER_PATH}, all accounted for.`,
);
