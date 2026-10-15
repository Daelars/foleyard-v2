// Structured accounting for pinned expected failures (#304).
//
// A count of `it.fails(` cannot say which regression slipped, so a correct
// expected failure could be silently swapped for an unrelated one. The ledger
// in docs/expected-failures.md is instead a table of structured entries; every
// pinned test carries its entry id in the title and this module maps the two
// sets to each other. Fixing a finding means flipping the test to `it` and
// removing its row in the same change, or the mapping stops lining up.
//
// Severity is explicit. Entries tagged `data-loss` are release blockers: the
// normal CI check reports them, `--release` (used by the release build gate)
// refuses to continue while any are pinned.
//
// Exposed separately from the CLI so tests can drive the parser and the
// matcher with synthetic ledgers instead of the repository's own.

const fs = require("node:fs");
const path = require("node:path");

const LEDGER_PATH = "docs/expected-failures.md";
const INTEGRATION_PREFIX = "src/test/integration/";

// Severity vocabulary. Add a value here only with a matching policy below.
const SEVERITIES = ["data-loss", "data-integrity", "data-correctness", "ux"];
// An unresolved expected failure that can destroy or corrupt user data blocks
// a release until it is fixed and removed from the ledger.
const RELEASE_BLOCKING_SEVERITIES = ["data-loss"];

// Owning context, per CONTEXT-MAP.md.
const OWNERS = ["Application", "Desktop runtime", "Yard Core", "Yard Tools"];

const LEDGER_COLUMNS = [
  "id",
  "finding",
  "area",
  "severity",
  "owner",
  "introduced",
  "reviewby",
  "test",
];

const ID_PATTERN = /^XF-[A-Z]{1,2}\d{2}-\d{2}$/;
const FINDING_PATTERN = /^[A-Z]{1,2}\d{2}$/;
const AREA_PATTERN = /^[a-z][a-z0-9-]*$/;
const VERSION_PATTERN = /^\d+\.\d+\.\d+$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TEST_FILE_PATTERN = /\.test\.(ts|tsx)$/;
const IT_FAILS_PATTERN = /it\.fails\(\s*(?:"([^"]*)"|'([^']*)'|`([^`]*)`)/g;
const ID_TOKEN_PATTERN = /\[(XF-[A-Z]{1,2}\d{2}-\d{2})\]/g;

const SKIP_DIRECTORIES = new Set([
  "node_modules",
  ".git",
  ".next",
  ".waveform-cache",
  ".t3",
  "dist-electron",
  "out",
  "coverage",
]);

function normalizePath(filePath) {
  return filePath.split(path.sep).join("/");
}

function defaultToday() {
  return new Date().toISOString().slice(0, 10);
}

function stripBackticks(cell) {
  const trimmed = cell.trim();
  const match = /^`(.*)`$/.exec(trimmed);
  return match ? match[1].trim() : trimmed;
}

/** Parse the structured ledger table. Cell shape, uniqueness and the review
 * date are validated here; matching against tests lives in linkLedger. */
function parseLedger(markdown, options = {}) {
  const today = options.today ?? defaultToday();
  const errors = [];
  const entries = [];
  const lines = markdown.split(/\r?\n/);

  let headerIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].trim().startsWith("|")) continue;
    const cells = lines[i]
      .split("|")
      .slice(1, -1)
      .map((cell) => cell.trim().toLowerCase().replace(/\s+/g, ""));
    if (
      cells.length === LEDGER_COLUMNS.length &&
      cells.every((cell, index) => cell === LEDGER_COLUMNS[index])
    ) {
      headerIndex = i;
      break;
    }
  }

  if (headerIndex === -1) {
    return {
      entries,
      errors: [
        `expected-failures: no ledger table found in ${LEDGER_PATH}; the header must be | ${LEDGER_COLUMNS.join(" | ")} |`,
      ],
    };
  }

  const seenIds = new Set();
  let rowNumber = headerIndex;
  for (let i = headerIndex + 2; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim().startsWith("|")) break;
    rowNumber = i + 1;
    const cells = line
      .split("|")
      .slice(1, -1)
      .map(stripBackticks);
    if (cells.length !== LEDGER_COLUMNS.length) {
      errors.push(
        `expected-failures: ${LEDGER_PATH}:${rowNumber} has ${cells.length} columns, expected ${LEDGER_COLUMNS.length}`,
      );
      continue;
    }

    const [id, finding, area, severity, owner, introduced, reviewBy, test] = cells;
    if (!ID_PATTERN.test(id)) {
      errors.push(
        `expected-failures: ${LEDGER_PATH}:${rowNumber} id "${id}" must match XF-<finding>-<nn>`,
      );
    } else if (seenIds.has(id)) {
      errors.push(`expected-failures: duplicate ledger id "${id}"`);
    }
    seenIds.add(id);

    if (!FINDING_PATTERN.test(finding)) {
      errors.push(
        `expected-failures: ${id} finding "${finding}" must look like B03 or I03`,
      );
    }
    if (!AREA_PATTERN.test(area)) {
      errors.push(`expected-failures: ${id} area "${area}" must be a slug`);
    }
    if (!SEVERITIES.includes(severity)) {
      errors.push(
        `expected-failures: ${id} severity "${severity}" must be one of ${SEVERITIES.join(", ")}`,
      );
    }
    if (!OWNERS.includes(owner)) {
      errors.push(
        `expected-failures: ${id} owner "${owner}" must be one of ${OWNERS.join(", ")}`,
      );
    }
    if (!VERSION_PATTERN.test(introduced)) {
      errors.push(
        `expected-failures: ${id} introduced "${introduced}" must be a product version like 0.1.8`,
      );
    }
    if (!DATE_PATTERN.test(reviewBy)) {
      errors.push(
        `expected-failures: ${id} review date "${reviewBy}" must be an ISO date (YYYY-MM-DD)`,
      );
    } else if (reviewBy < today) {
      errors.push(
        `expected-failures: ${id} review date ${reviewBy} has passed; re-review it and move the date, or fix and remove the entry`,
      );
    }
    if (!TEST_FILE_PATTERN.test(test)) {
      errors.push(
        `expected-failures: ${id} test "${test}" must be a *.test.ts/.tsx path`,
      );
    }

    entries.push({ id, finding, area, severity, owner, introduced, reviewBy, test });
  }

  return { entries, errors };
}

/** Extract pinned expected failures from one test file's source. A pinned test
 * must carry its ledger id as the first token of its title. */
function scanTestSource(source, filePath) {
  const file = normalizePath(filePath);
  const errors = [];
  const tests = [];

  for (const match of source.matchAll(IT_FAILS_PATTERN)) {
    const title = match[1] ?? match[2] ?? match[3] ?? "";
    const idMatch = /^\s*\[(XF-[A-Z]{1,2}\d{2}-\d{2})\]/.exec(title);
    if (idMatch) {
      tests.push({ id: idMatch[1], title, file });
    } else {
      tests.push({ id: null, title, file });
      errors.push(
        `expected-failures: expected failure in ${file} has no ledger id: "${title}" (prefix the title with [XF-...])`,
      );
    }
  }

  const pinnedCounts = new Map();
  for (const test of tests) {
    if (test.id) pinnedCounts.set(test.id, (pinnedCounts.get(test.id) ?? 0) + 1);
  }
  const citedCounts = new Map();
  for (const match of source.matchAll(ID_TOKEN_PATTERN)) {
    citedCounts.set(match[1], (citedCounts.get(match[1]) ?? 0) + 1);
  }
  for (const [id, count] of citedCounts) {
    if (count > (pinnedCounts.get(id) ?? 0)) {
      errors.push(
        `expected-failures: ${id} appears in ${file} outside an it.fails() title; a fixed regression keeps its test and drops the id`,
      );
    }
  }

  return { tests, errors };
}

function listTestFiles(directory, found = []) {
  if (!fs.existsSync(directory)) return found;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRECTORIES.has(entry.name)) continue;
      listTestFiles(path.join(directory, entry.name), found);
      continue;
    }
    if (TEST_FILE_PATTERN.test(entry.name)) found.push(path.join(directory, entry.name));
  }
  return found;
}

/** Scan every test file in the repository, not just the integration suite, so
 * a pinned regression that drifts elsewhere is still accounted for. */
function scanRepository(root) {
  const errors = [];
  const tests = [];
  for (const file of listTestFiles(root)) {
    const relative = normalizePath(path.relative(root, file));
    const result = scanTestSource(fs.readFileSync(file, "utf8"), relative);
    errors.push(...result.errors);
    tests.push(...result.tests);
  }
  return { tests, errors };
}

function loadLedger(root, options = {}) {
  const ledgerPath = path.join(root, LEDGER_PATH);
  if (!fs.existsSync(ledgerPath)) {
    return {
      entries: [],
      errors: [`expected-failures: ledger not found at ${LEDGER_PATH}`],
    };
  }
  return parseLedger(fs.readFileSync(ledgerPath, "utf8"), options);
}

/** Map pinned tests to ledger entries one-to-one, by id. */
function linkLedger({ entries, tests }) {
  const errors = [];
  const entryById = new Map(entries.map((entry) => [entry.id, entry]));
  const testById = new Map();

  for (const test of tests) {
    if (!test.id) {
      errors.push(
        `expected-failures: expected failure in ${test.file} has no ledger id: "${test.title}"`,
      );
      continue;
    }
    if (!test.file.startsWith(INTEGRATION_PREFIX)) {
      errors.push(
        `expected-failures: ${test.id} in ${test.file} is outside ${INTEGRATION_PREFIX}; expected failures must live in the integration suite`,
      );
    }
    if (testById.has(test.id)) {
      const first = testById.get(test.id);
      errors.push(
        `expected-failures: ${test.id} is pinned more than once (${first.file} and ${test.file})`,
      );
      continue;
    }
    testById.set(test.id, test);
    if (!entryById.has(test.id)) {
      errors.push(
        `expected-failures: unregistered expected failure ${test.id} in ${test.file}; add a row to ${LEDGER_PATH}`,
      );
    }
  }

  for (const entry of entries) {
    const test = testById.get(entry.id);
    if (!test) {
      errors.push(
        `expected-failures: ledger entry ${entry.id} has no pinned it.fails() in ${entry.test}; fix the finding and remove the entry, or restore the test`,
      );
      continue;
    }
    if (test.file !== entry.test) {
      errors.push(
        `expected-failures: ledger entry ${entry.id} points at ${entry.test} but the pinned test lives in ${test.file}`,
      );
    }
  }

  return { errors };
}

function releaseBlockers(entries) {
  return entries.filter((entry) =>
    RELEASE_BLOCKING_SEVERITIES.includes(entry.severity),
  );
}

/** Full check of the repository ledger against the repository tests. */
function evaluateRepository(root, options = {}) {
  const ledgerResult = loadLedger(root, options);
  const scanResult = scanRepository(root);
  const linked = linkLedger({
    entries: ledgerResult.entries,
    tests: scanResult.tests,
  });
  return {
    entries: ledgerResult.entries,
    tests: scanResult.tests,
    errors: [...ledgerResult.errors, ...scanResult.errors, ...linked.errors],
    blockers: releaseBlockers(ledgerResult.entries),
  };
}

/** Throws when the ledger is invalid or a release-blocking finding is pinned.
 * Used by the release build gate. */
function assertReleaseReady(root, options = {}) {
  const result = evaluateRepository(root, options);
  if (result.errors.length > 0) {
    throw new Error(
      `expected-failures: ledger is invalid:\n  - ${result.errors.join("\n  - ")}`,
    );
  }
  if (result.blockers.length > 0) {
    throw new Error(
      `expected-failures: release blocked by ${result.blockers.length} data-loss finding(s): ${result.blockers
        .map((entry) => entry.id)
        .join(", ")}`,
    );
  }
  return result;
}

module.exports = {
  LEDGER_PATH,
  INTEGRATION_PREFIX,
  SEVERITIES,
  RELEASE_BLOCKING_SEVERITIES,
  OWNERS,
  parseLedger,
  scanTestSource,
  scanRepository,
  loadLedger,
  linkLedger,
  releaseBlockers,
  evaluateRepository,
  assertReleaseReady,
};
