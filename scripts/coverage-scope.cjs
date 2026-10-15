#!/usr/bin/env node
/**
 * Coverage scope and subsystem floors (issue #303).
 *
 * One aggregate percentage hid which part of the product was tested: the
 * suite could add ten thousand untested Application lines and still move the
 * number up on strong Yard Core coverage. This module is the single source of
 * truth for what coverage measures, which shipped subsystem each file belongs
 * to, and the floor each subsystem must clear. `vitest.config.ts` consumes it
 * directly, so the thresholds and the report can never drift apart.
 *
 * Scope decisions that matter:
 *
 * - The Desktop runtime (`electron/**`) is measured, not just the renderer.
 *   Electron main-process modules are required in-process by the desktop
 *   integration tests, so v8 sees them.
 * - Build and release scripts (`scripts/*.cjs`, `scripts/*.ts`) are measured.
 *   Most run as child processes, whose v8 coverage is not merged into the
 *   parent run, so their figure is honestly low; the security-critical pieces
 *   (postinstall digest verification) are exercised in-process and are held by
 *   the floor.
 * - Generated and vendored primitives are excluded by explicit path, never by
 *   a broad directory, so first-party components sitting beside them keep
 *   their coverage.
 * - Dev benchmarking harnesses are declared out rather than silently measured.
 *
 * The reporting functions are pure so `coverage-reporting.test.ts` can pin
 * them against synthetic summaries and diffs.
 */

const path = require("node:path");

/**
 * Metrics used by both vitest's coverage summary and our own aggregation.
 * @typedef {"lines" | "statements" | "functions" | "branches"} MetricName
 */

/**
 * A measured tree: a root directory and the extensions that count as product.
 * `packages/yard-core` and `packages/yard-tools` only hold source under `src/`;
 * the extension filter keeps manifests and READMEs out.
 * @type {Array<{ root: string; extensions: string[] }>}
 */
const COVERAGE_INCLUDES = [
  { root: "src", extensions: [".ts", ".tsx"] },
  { root: "packages/yard-core", extensions: [".ts", ".tsx"] },
  { root: "packages/yard-tools", extensions: [".ts", ".tsx"] },
  { root: "electron", extensions: [".cjs"] },
  { root: "scripts", extensions: [".cjs", ".ts"] },
];

// First-party UI sitting beside the vendored shadcn/base-ui primitives. The
// ui/ directory is a mix, so excluding it wholesale (as the old config did)
// hid behaviour we own and do test.
const VENDORED_UI = [
  "src/components/ui/badge.tsx",
  "src/components/ui/button.tsx",
  "src/components/ui/card.tsx",
  "src/components/ui/context-menu.tsx",
  "src/components/ui/dialog.tsx",
  "src/components/ui/dotm-square-3.tsx",
  "src/components/ui/dropdown-menu.tsx",
  "src/components/ui/input.tsx",
  "src/components/ui/sonner.tsx",
  "src/components/ui/switch.tsx",
  "src/components/ui/tooltip.tsx",
];

// Hand-written re-export barrels: no behaviour of their own to assert.
const BARRELS = [
  "src/components/variant-i/index.ts",
  "packages/yard-core/src/index.ts",
  "packages/yard-core/src/extensions-v2/index.ts",
  "packages/yard-tools/auto-tag-v2/src/index.ts",
  "packages/yard-tools/drop-rules-v2/src/index.ts",
  "packages/yard-tools/folder-janitor-v2/src/index.ts",
  "packages/yard-tools/library-gatherer-v2/src/index.ts",
  "packages/yard-tools/make-pack-v2/src/index.ts",
  "packages/yard-tools/smart-collections-v2/src/index.ts",
  "packages/yard-tools/sound-shelf-v2/src/index.ts",
];

/**
 * Rules that remove a file from coverage. `kind` and `reason` are required so
 * an exclusion is a recorded decision, not a gap; `coverage-reporting.test.ts`
 * fails on a stale path and on a product file that is neither measured nor
 * declared here.
 * @type {Array<{ kind: string; reason: string; path?: string; root?: string; suffix?: string }>}
 */
const COVERAGE_EXCLUDES = [
  {
    kind: "test",
    suffix: ".test.ts",
    reason: "Test files assert behaviour; they are not product code.",
  },
  {
    kind: "test",
    suffix: ".test.tsx",
    reason: "Test files assert behaviour; they are not product code.",
  },
  {
    kind: "types",
    suffix: ".d.ts",
    reason: "Ambient type declarations emit no runtime behaviour.",
  },
  {
    kind: "fixture",
    root: "src/test",
    reason: "Throwaway fixtures and helpers that build disposable libraries.",
  },
  {
    kind: "prototype",
    root: "src/app/prototype",
    reason: "Throwaway prototypes that resolve to not-found in production.",
  },
  {
    kind: "generated",
    path: "src/app/layout.tsx",
    reason: "Next.js framework entrypoint with no logic of its own.",
  },
  {
    kind: "dev-tooling",
    path: "scripts/benchmark-scan.ts",
    reason: "Developer scan benchmark, not a build or release script.",
  },
  {
    kind: "dev-tooling",
    root: "scripts/performance",
    reason: "Performance harness with its own README, run by hand.",
  },
  ...VENDORED_UI.map((file) => ({
    kind: "vendored",
    path: file,
    reason: "Vendored shadcn/base-ui or dotmatrix registry primitive.",
  })),
  ...BARRELS.map((file) => ({
    kind: "barrel",
    path: file,
    reason: "Hand-written re-export barrel with no behaviour of its own.",
  })),
];

/**
 * Aggregate floors across every measured file. Kept one point below the
 * measured baseline so ordinary churn does not fail a run; raised, never
 * lowered, as coverage rises.
 * @type {Record<MetricName, number>}
 */
const GLOBAL_FLOORS = {
  lines: 52,
  statements: 50.5,
  functions: 46.5,
  branches: 43,
};

/**
 * Shipped subsystems and their independent floors. Roots may overlap: the
 * Application aggregate contains the UI and the server routes, exactly as the
 * vitest glob thresholds do, so the reported figure and the enforced floor are
 * always the same set of files.
 *
 * Floors are one point below the measured baseline (see docs/development.md).
 * @type {Array<{ id: string; label: string; roots: string[]; floors: Record<MetricName, number> }>}
 */
const SUBSYSTEMS = [
  {
    id: "application-ui",
    label: "Application UI",
    roots: ["src/components"],
    floors: { lines: 25, statements: 25, functions: 27.5, branches: 24.5 },
  },
  {
    id: "application-routes",
    label: "Application server routes",
    roots: ["src/app/api"],
    floors: { lines: 52.5, statements: 52, functions: 54.5, branches: 52.5 },
  },
  {
    id: "application",
    label: "Application",
    roots: ["src"],
    floors: { lines: 42, statements: 41, functions: 35, branches: 31.5 },
  },
  {
    id: "desktop-runtime",
    label: "Desktop runtime",
    roots: ["electron"],
    floors: { lines: 32.5, statements: 32, functions: 22.5, branches: 30 },
  },
  {
    id: "yard-core",
    label: "Yard Core",
    roots: ["packages/yard-core"],
    floors: { lines: 86.5, statements: 85, functions: 86, branches: 79 },
  },
  {
    id: "yard-tools",
    label: "Yard Tools",
    roots: ["packages/yard-tools"],
    floors: { lines: 90.5, statements: 88.5, functions: 92.5, branches: 69.5 },
  },
  {
    id: "build-scripts",
    label: "Build and release scripts",
    roots: ["scripts"],
    floors: { lines: 14, statements: 14.5, functions: 27.5, branches: 14 },
  },
];

const METRIC_NAMES = ["lines", "statements", "functions", "branches"];

/** Normalize to forward slashes so Windows and POSIX agree. */
function normalizePath(value) {
  return value.replace(/\\/g, "/").replace(/^\.\//, "");
}

function underRoot(relPath, root) {
  return relPath === root || relPath.startsWith(`${root}/`);
}

/** True when the path sits in a measured tree with a measured extension. */
function isCoverageCandidate(relPath) {
  const normalized = normalizePath(relPath);
  return COVERAGE_INCLUDES.some(
    (tree) =>
      underRoot(normalized, tree.root) &&
      tree.extensions.includes(path.posix.extname(normalized)),
  );
}

function matchesExclusion(rule, relPath) {
  if (rule.path) return relPath === normalizePath(rule.path);
  if (rule.root) return underRoot(relPath, normalizePath(rule.root));
  return relPath.endsWith(rule.suffix);
}

/** The recorded exclusion for a path, or null when it is measured. */
function exclusionFor(relPath) {
  const normalized = normalizePath(relPath);
  for (const rule of COVERAGE_EXCLUDES) {
    if (matchesExclusion(rule, normalized)) {
      return { kind: rule.kind, reason: rule.reason };
    }
  }
  return null;
}

function isCoverageExcluded(relPath) {
  return exclusionFor(relPath) !== null;
}

/** In a measured tree, not excluded: i.e. it should appear in the report. */
function isCoverageIncluded(relPath) {
  const normalized = normalizePath(relPath);
  return isCoverageCandidate(normalized) && !isCoverageExcluded(normalized);
}

/** The subsystem a measured file belongs to, or null when out of scope. */
function classifySubsystem(relPath) {
  const normalized = normalizePath(relPath);
  for (const subsystem of SUBSYSTEMS) {
    if (subsystem.roots.some((root) => underRoot(normalized, root))) return subsystem.id;
  }
  return null;
}

function subsystemById(id) {
  return SUBSYSTEMS.find((subsystem) => subsystem.id === id) || null;
}

function emptyMetric() {
  return { covered: 0, total: 0, pct: 0 };
}

function metricFrom(covered, total) {
  return {
    covered,
    total,
    pct: total === 0 ? 0 : Math.round((covered / total) * 1000) / 10,
  };
}

/**
 * Aggregate a vitest `coverage-summary.json` into one row per subsystem.
 * Keys are absolute paths; `rootDir` strips the checkout prefix. Subsystem
 * roots may overlap (the UI sits inside the Application), matching the way
 * vitest enforces each glob threshold independently.
 * @param {Record<string, unknown>} summary
 * @param {string} rootDir
 */
function aggregateBySubsystem(summary, rootDir) {
  const rows = SUBSYSTEMS.map((subsystem) => ({
    id: subsystem.id,
    label: subsystem.label,
    files: 0,
    metrics: {
      lines: emptyMetric(),
      statements: emptyMetric(),
      functions: emptyMetric(),
      branches: emptyMetric(),
    },
  }));
  const byId = new Map(rows.map((row) => [row.id, row]));

  for (const [absolute, metrics] of Object.entries(summary)) {
    if (absolute === "total" || !metrics) continue;
    const relPath = normalizePath(path.relative(rootDir, absolute));
    // Keep the report on the same scope as vitest: a vendored or generated
    // file is out of scope even if a summary somehow includes it.
    if (isCoverageExcluded(relPath)) continue;

    for (const subsystem of SUBSYSTEMS) {
      if (!subsystem.roots.some((root) => underRoot(relPath, root))) continue;
      const row = byId.get(subsystem.id);
      row.files += 1;
      for (const name of METRIC_NAMES) {
        const value = /** @type {Record<string, { covered: number; total: number }>} */ (metrics)[name];
        row.metrics[name].covered += value.covered;
        row.metrics[name].total += value.total;
      }
    }
  }

  for (const row of rows) {
    for (const name of METRIC_NAMES) {
      row.metrics[name] = metricFrom(row.metrics[name].covered, row.metrics[name].total);
    }
  }
  return rows;
}

function formatMetric(metric) {
  return metric.total === 0 ? "n/a" : `${metric.pct.toFixed(1)}%`;
}

/** A stable, human-readable table of the subsystem figures. */
function formatSubsystemReport(rows) {
  const header = [
    "Subsystem".padEnd(30),
    "files".padStart(6),
    "lines".padStart(8),
    "stmts".padStart(8),
    "funcs".padStart(8),
    "branch".padStart(8),
  ].join(" ");
  const lines = ["Coverage by shipped subsystem", header, "-".repeat(header.length)];
  for (const row of rows) {
    lines.push(
      [
        row.label.padEnd(30),
        String(row.files).padStart(6),
        formatMetric(row.metrics.lines).padStart(8),
        formatMetric(row.metrics.statements).padStart(8),
        formatMetric(row.metrics.functions).padStart(8),
        formatMetric(row.metrics.branches).padStart(8),
      ].join(" "),
    );
  }
  return lines.join("\n");
}

/** Vitest globs for the measured trees and the recorded exclusions. */
function coverageScope() {
  const include = COVERAGE_INCLUDES.map((tree) => {
    const extensions = tree.extensions.map((ext) => ext.slice(1));
    const pattern = extensions.length === 1 ? `*.${extensions[0]}` : `*.{${extensions.join(",")}}`;
    return `${tree.root}/**/${pattern}`;
  });
  const exclude = COVERAGE_EXCLUDES.map((rule) => {
    if (rule.path) return normalizePath(rule.path);
    if (rule.root) return `${normalizePath(rule.root)}/**`;
    return `**/*${rule.suffix}`;
  });
  return { include, exclude };
}

/** Aggregate floors keyed by vitest glob, one per subsystem root. */
function subsystemThresholds() {
  const thresholds = {};
  for (const subsystem of SUBSYSTEMS) {
    for (const root of subsystem.roots) {
      thresholds[`${root}/**`] = { ...subsystem.floors };
    }
  }
  return thresholds;
}

/**
 * Everything vitest.config.ts needs to configure coverage, derived from the
 * declarations above rather than hand-listed a second time.
 */
function coverageConfig() {
  const { include, exclude } = coverageScope();
  return { include, exclude, thresholds: subsystemThresholds() };
}

module.exports = {
  COVERAGE_INCLUDES,
  COVERAGE_EXCLUDES,
  GLOBAL_FLOORS,
  SUBSYSTEMS,
  METRIC_NAMES,
  normalizePath,
  isCoverageCandidate,
  isCoverageIncluded,
  isCoverageExcluded,
  exclusionFor,
  classifySubsystem,
  subsystemById,
  aggregateBySubsystem,
  formatSubsystemReport,
  coverageScope,
  subsystemThresholds,
  coverageConfig,
};
