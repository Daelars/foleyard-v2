// Guards the expected-to-fail regression set (#133).
//
// Each it.fails() in src/test/integration/ pins a live defect. Deleting one
// without fixing the finding would pass the suite silently, so CI requires
// the it.fails count to equal the entries in docs/expected-failures.md.
// Fixing a defect flips its test to it() and removes its entry in the same
// PR; both sides of this check move together.

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const integrationDir = path.join(root, "src", "test", "integration");
const docsPath = path.join(root, "docs", "expected-failures.md");

function countOccurrences(filePath, needle) {
  const source = fs.readFileSync(filePath, "utf8");
  return source.split(needle).length - 1;
}

let fails = 0;
for (const entry of fs.readdirSync(integrationDir)) {
  if (!/\.test\.(ts|tsx)$/.test(entry)) continue;
  fails += countOccurrences(path.join(integrationDir, entry), "it.fails(");
}

const docs = fs.readFileSync(docsPath, "utf8");
const recorded = docs.split("\n").filter((line) => line.startsWith("- ")).length;

if (fails !== recorded) {
  console.error(
    `expected-failures: found ${fails} it.fails() in src/test/integration/ but docs/expected-failures.md lists ${recorded}.`,
  );
  console.error(
    "If you fixed a finding, flip its test to it() and remove its entry in the same PR. " +
      "If you deleted a test, that is the signal working: put it back or fix the defect.",
  );
  process.exit(1);
}

console.log(`expected-failures: ${fails} pinned regressions, all accounted for.`);
