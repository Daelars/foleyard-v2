#!/usr/bin/env node
/**
 * Changed-code coverage gate (issue #303).
 *
 * Subsystem floors hold the average up; this holds the edge down. A new
 * product path that no test executes is invisible in an aggregate but obvious
 * in a diff, so every changed line in a measured file must be reached by at
 * least one executed statement or function. A line with no instrumented unit
 * (a comment, a blank line, a brace) is not a finding.
 *
 * Scope is identical to coverage itself: only files vitest measures
 * (`coverage-scope.cjs`) are checked, so tests, fixtures, prototypes, vendored
 * primitives and dev harnesses never gate a change.
 *
 * Usage:
 *   COVERAGE_BASE_REF=origin/development node scripts/check-changed-coverage.cjs
 *
 * Reads `coverage/coverage-final.json` (the `json` reporter) and the diff from
 * the merge base of COVERAGE_BASE_REF. Exits non-zero when a changed line is
 * uncovered.
 */

const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const scope = require("./coverage-scope.cjs");

const DEFAULT_BASE_REF = "development";

/**
 * Parse `git diff --unified=0` into added line numbers per file. Only the new
 * side matters: those are the lines this change introduces.
 * @param {string} diffText
 * @returns {Record<string, number[]>}
 */
function parseChangedLines(diffText) {
  /** @type {Record<string, number[]>} */
  const changed = {};
  let current = null;
  let newLine = 0;

  for (const raw of diffText.split(/\r?\n/)) {
    if (raw.startsWith("+++ ")) {
      const target = raw.slice(4).trim();
      current = target === "/dev/null" ? null : target.replace(/^b\//, "");
      if (current !== null && !changed[current]) changed[current] = [];
      continue;
    }
    if (raw.startsWith("--- ") || raw.startsWith("diff --git ")) continue;

    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(raw);
    if (hunk) {
      newLine = Number(hunk[1]);
      continue;
    }
    if (current === null) continue;

    if (raw.startsWith("+")) {
      changed[current].push(newLine);
      newLine += 1;
    } else if (raw.startsWith(" ")) {
      newLine += 1;
    }
    // "-" lines and the "\ No newline" marker do not advance the new side.
  }

  for (const file of Object.keys(changed)) {
    changed[file] = [...new Set(changed[file])].sort((a, b) => a - b);
  }
  return changed;
}

/**
 * Execution counts per source line, taken from statements and function
 * declarations. Branch arms are reported by the subsystem floors, not here.
 * @param {any} coverageEntry
 */
function lineExecutionCounts(coverageEntry) {
  /** @type {Map<number, number[]>} */
  const counts = new Map();
  const add = (line, count) => {
    if (!counts.has(line)) counts.set(line, []);
    counts.get(line).push(count);
  };

  for (const [id, location] of Object.entries(coverageEntry.statementMap || {})) {
    add(location.start.line, coverageEntry.s[id] ?? 0);
  }
  for (const [id, fn] of Object.entries(coverageEntry.fnMap || {})) {
    add(fn.decl.start.line, coverageEntry.f[id] ?? 0);
  }
  return counts;
}

/**
 * Changed lines that carry at least one instrumented unit nothing executed.
 * @param {any} coverageEntry
 * @param {number[]} changedLines
 */
function uncoveredLinesInFile(coverageEntry, changedLines) {
  if (!coverageEntry) return [...new Set(changedLines)].sort((a, b) => a - b);
  const counts = lineExecutionCounts(coverageEntry);
  return [...new Set(changedLines)]
    .filter((line) => {
      const lineCounts = counts.get(line);
      return Boolean(lineCounts && lineCounts.some((count) => count === 0));
    })
    .sort((a, b) => a - b);
}

/**
 * Uncovered changed product lines across the whole change.
 * @param {{
 *   changedByFile: Record<string, number[]>,
 *   coverageFinal: Record<string, unknown>,
 *   rootDir: string,
 *   isInScope?: (relPath: string) => boolean,
 * }} input
 */
function findUncoveredChangedLines({ changedByFile, coverageFinal, rootDir, isInScope }) {
  const inScope =
    isInScope || ((relPath) => scope.isCoverageIncluded(relPath) && !scope.isCoverageExcluded(relPath));
  const normalizedCoverage = new Map();
  for (const absolute of Object.keys(coverageFinal)) {
    normalizedCoverage.set(scope.normalizePath(path.resolve(rootDir, absolute)), coverageFinal[absolute]);
  }

  /** @type {Array<{ file: string; lines: number[] }>} */
  const findings = [];
  for (const file of Object.keys(changedByFile).sort()) {
    const relPath = scope.normalizePath(file);
    if (!inScope(relPath)) continue;
    const entry = normalizedCoverage.get(scope.normalizePath(path.resolve(rootDir, relPath)));
    const lines = uncoveredLinesInFile(entry, changedByFile[file]);
    if (lines.length > 0) findings.push({ file: relPath, lines });
  }
  return findings;
}

/** Lines of `git diff --unified=0` for the merge base of `baseRef`..HEAD. */
function changedLinesForRef(baseRef, rootDir) {
  const diff = execFileSync(
    "git",
    ["diff", "--unified=0", "--no-color", "--no-ext-diff", `${baseRef}...HEAD`],
    { cwd: rootDir, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] },
  );
  return parseChangedLines(diff);
}

/**
 * Run the gate and return an exit code (0 clean, 1 findings or setup error).
 * Kept free of `process` so the tests can drive every path in-process.
 * @param {{
 *   baseRef: string,
 *   coveragePath: string,
 *   rootDir: string,
 *   changedByFile?: Record<string, number[]>,
 *   log?: (message: string) => void,
 *   error?: (message: string) => void,
 * }} input
 */
function run({ baseRef, coveragePath, rootDir, changedByFile, log = console.log, error = console.error }) {
  if (!fs.existsSync(coveragePath)) {
    error(
      `changed-coverage: ${path.relative(rootDir, coveragePath)} is missing. ` +
        "Run `npm run test:coverage` first (the `json` reporter writes it).",
    );
    return 1;
  }

  let changedLines = changedByFile;
  if (!changedLines) {
    try {
      changedLines = changedLinesForRef(baseRef, rootDir);
    } catch (failure) {
      error(
        `changed-coverage: cannot diff against "${baseRef}". Set COVERAGE_BASE_REF to a ref ` +
          "this checkout has fetched (CI uses origin/<base branch>).",
      );
      error(String(failure instanceof Error ? failure.message : failure));
      return 1;
    }
  }

  const coverageFinal = JSON.parse(fs.readFileSync(coveragePath, "utf8"));
  const findings = findUncoveredChangedLines({ changedByFile: changedLines, coverageFinal, rootDir });

  const changedProductFiles = Object.keys(changedLines).filter((file) =>
    scope.isCoverageIncluded(file),
  );
  if (findings.length === 0) {
    log(
      `changed-coverage: ${changedProductFiles.length} changed product file(s) against "${baseRef}" — every changed line is executed.`,
    );
    return 0;
  }

  let totalLines = 0;
  error(`changed-coverage: uncovered changed lines against "${baseRef}":`);
  for (const finding of findings) {
    totalLines += finding.lines.length;
    error(`  ${finding.file}: ${finding.lines.join(", ")}`);
  }
  error(
    `changed-coverage: ${totalLines} changed line(s) in ${findings.length} file(s) never ran. ` +
      "Cover the new path, or — if it is genuinely unreachable — say why in the change.",
  );
  return 1;
}

function main() {
  const rootDir = path.resolve(__dirname, "..");
  process.exitCode = run({
    baseRef: process.env.COVERAGE_BASE_REF || DEFAULT_BASE_REF,
    coveragePath:
      process.env.COVERAGE_FINAL_PATH || path.join(rootDir, "coverage", "coverage-final.json"),
    rootDir,
  });
}

module.exports = {
  DEFAULT_BASE_REF,
  parseChangedLines,
  lineExecutionCounts,
  uncoveredLinesInFile,
  findUncoveredChangedLines,
  changedLinesForRef,
  run,
  main,
};

/* v8 ignore next 3 */
if (require.main === module) {
  main();
}
