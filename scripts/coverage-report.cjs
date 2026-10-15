#!/usr/bin/env node
/**
 * Per-subsystem coverage report (issue #303).
 *
 * Reads the vitest coverage summary written by `test:coverage` and writes a
 * machine-readable `coverage/subsystem-summary.json` beside it, then prints
 * the table. The thresholds in `vitest.config.ts` are the gate; this is the
 * trend artifact CI uploads, so a reviewer can see Yard Core at 87% and
 * Desktop runtime at 33% instead of one blended number.
 *
 * Usage: node scripts/coverage-report.cjs
 */

const fs = require("node:fs");
const path = require("node:path");

const scope = require("./coverage-scope.cjs");

/**
 * Build the report, write the machine-readable artifact and return an exit
 * code. Paths are injected so the tests can drive both the clean and the
 * missing-artifact paths in-process.
 * @param {{
 *   summaryPath: string,
 *   rootDir: string,
 *   artifactPath?: string,
 *   log?: (message: string) => void,
 *   error?: (message: string) => void,
 * }} input
 */
function run({ summaryPath, rootDir, artifactPath, log = console.log, error = console.error }) {
  if (!fs.existsSync(summaryPath)) {
    error(
      `coverage-report: ${path.relative(rootDir, summaryPath)} is missing. ` +
        "Run `npm run test:coverage` first.",
    );
    return 1;
  }

  const summary = JSON.parse(fs.readFileSync(summaryPath, "utf8"));
  const rows = scope.aggregateBySubsystem(summary, rootDir);

  log(scope.formatSubsystemReport(rows));

  const artifact = {
    generatedAt: new Date().toISOString(),
    source: scope.normalizePath(path.relative(rootDir, summaryPath)),
    globalFloors: scope.GLOBAL_FLOORS,
    subsystems: rows.map((row) => ({
      id: row.id,
      label: row.label,
      files: row.files,
      metrics: row.metrics,
      floors: scope.subsystemById(row.id)?.floors ?? null,
    })),
  };

  const target = artifactPath || path.join(rootDir, "coverage", "subsystem-summary.json");
  fs.writeFileSync(target, `${JSON.stringify(artifact, null, 2)}\n`);
  log(`\ncoverage-report: wrote ${scope.normalizePath(path.relative(rootDir, target))}`);
  return 0;
}

function main() {
  const rootDir = path.resolve(__dirname, "..");
  process.exitCode = run({
    summaryPath:
      process.env.COVERAGE_SUMMARY_PATH || path.join(rootDir, "coverage", "coverage-summary.json"),
    artifactPath: process.env.COVERAGE_ARTIFACT_PATH,
    rootDir,
  });
}

module.exports = { run, main };

/* v8 ignore next 3 */
if (require.main === module) {
  main();
}
