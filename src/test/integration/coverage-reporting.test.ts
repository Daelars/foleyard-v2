import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

// Issue #303: one aggregate coverage number hid which subsystem was covered.
// The reporting logic lives in scripts/coverage-scope.cjs (the single source
// of truth shared with vitest.config.ts) and scripts/check-changed-coverage.cjs
// (the changed-code gate). Both are pure enough to test with synthetic data,
// and the guards below hold the declared scope to what is actually on disk so
// a new vendored primitive or a new product file cannot slip past review.

const require_ = createRequire(import.meta.url);
const scope = require_("../../../scripts/coverage-scope.cjs") as {
  normalizePath: (value: string) => string;
  isCoverageCandidate: (relPath: string) => boolean;
  isCoverageIncluded: (relPath: string) => boolean;
  isCoverageExcluded: (relPath: string) => boolean;
  exclusionFor: (relPath: string) => { kind: string; reason: string } | null;
  classifySubsystem: (relPath: string) => string | null;
  coverageConfig: () => {
    include: string[];
    exclude: string[];
    thresholds: Record<string, number | Record<string, number>>;
  };
  aggregateBySubsystem: (
    summary: Record<string, unknown>,
    rootDir: string,
  ) => Array<{
    id: string;
    label: string;
    files: number;
    metrics: Record<"lines" | "statements" | "functions" | "branches", { covered: number; total: number; pct: number }>;
  }>;
  formatSubsystemReport: (rows: Array<unknown>) => string;
  SUBSYSTEMS: Array<{ id: string; label: string; roots: string[]; floors: Record<string, number> }>;
  COVERAGE_EXCLUDES: Array<{ kind: string; reason: string; path?: string; root?: string; suffix?: string }>;
};

const changed = require_("../../../scripts/check-changed-coverage.cjs") as {
  parseChangedLines: (diffText: string) => Record<string, number[]>;
  uncoveredLinesInFile: (coverageEntry: unknown, changedLines: number[]) => number[];
  findUncoveredChangedLines: (input: {
    changedByFile: Record<string, number[]>;
    coverageFinal: Record<string, unknown>;
    rootDir: string;
    isInScope?: (relPath: string) => boolean;
  }) => Array<{ file: string; lines: number[] }>;
  run: (input: {
    baseRef: string;
    coveragePath: string;
    rootDir: string;
    changedByFile?: Record<string, number[]>;
    log?: (message: string) => void;
    error?: (message: string) => void;
  }) => number;
  main: () => void;
};

const report = require_("../../../scripts/coverage-report.cjs") as {
  run: (input: {
    summaryPath: string;
    rootDir: string;
    artifactPath?: string;
    log?: (message: string) => void;
    error?: (message: string) => void;
  }) => number;
  main: () => void;
};

const repoRoot = path.resolve(__dirname, "..", "..", "..");
const toAbsolute = (relPath: string) => path.join(repoRoot, ...relPath.split("/"));

const metric = (covered: number, total: number) => ({ covered, total, pct: 0 });
const entry = (metrics: Record<string, { covered: number; total: number }>) => ({
  lines: { ...metric(0, 0), ...metrics.lines },
  statements: { ...metric(0, 0), ...metrics.statements },
  functions: { ...metric(0, 0), ...metrics.functions },
  branches: { ...metric(0, 0), ...metrics.branches },
});

function walkFiles(directory: string, found: string[] = []): string[] {
  for (const dirent of fs.readdirSync(directory, { withFileTypes: true })) {
    if (dirent.name === "node_modules" || dirent.name === ".git" || dirent.name === "coverage") {
      continue;
    }
    const absolute = path.join(directory, dirent.name);
    if (dirent.isDirectory()) {
      walkFiles(absolute, found);
      continue;
    }
    found.push(scope.normalizePath(path.relative(repoRoot, absolute)));
  }
  return found;
}

describe("coverage scope", () => {
  it("classifies a file into exactly one subsystem, most specific first", () => {
    expect(scope.classifySubsystem("src/components/FileTable/table.tsx")).toBe("application-ui");
    expect(scope.classifySubsystem("src/hooks/use-library.ts")).toBe("application");
    expect(scope.classifySubsystem("src/app/api/scan/route.ts")).toBe("application-routes");
    expect(scope.classifySubsystem("src/lib/db.ts")).toBe("application");
    expect(scope.classifySubsystem("src/app/library/page.tsx")).toBe("application");
    expect(scope.classifySubsystem("electron/main/ipc.cjs")).toBe("desktop-runtime");
    expect(scope.classifySubsystem("packages/yard-core/src/domain/tag.ts")).toBe("yard-core");
    expect(
      scope.classifySubsystem("packages/yard-tools/make-pack-v2/src/handlers.ts"),
    ).toBe("yard-tools");
    expect(scope.classifySubsystem("scripts/postinstall.cjs")).toBe("build-scripts");
    expect(scope.classifySubsystem("docs/index.md")).toBeNull();
    expect(scope.classifySubsystem("README.md")).toBeNull();
  });

  it("aggregates a coverage summary into per-subsystem figures", () => {
    const rows = scope.aggregateBySubsystem(
      {
        total: entry({
          lines: { covered: 100, total: 200 },
          statements: { covered: 1, total: 2 },
          functions: { covered: 1, total: 2 },
          branches: { covered: 1, total: 2 },
        }),
        [toAbsolute("src/lib/a.ts")]: entry({
          lines: { covered: 6, total: 10 },
          statements: { covered: 6, total: 10 },
          functions: { covered: 1, total: 2 },
          branches: { covered: 1, total: 4 },
        }),
        [toAbsolute("src/components/ui/button.tsx")]: entry({
          lines: { covered: 0, total: 10 },
          statements: { covered: 0, total: 10 },
          functions: { covered: 0, total: 2 },
          branches: { covered: 0, total: 4 },
        }),
        [toAbsolute("electron/main/ipc.cjs")]: entry({
          lines: { covered: 3, total: 6 },
          statements: { covered: 3, total: 6 },
          functions: { covered: 1, total: 4 },
          branches: { covered: 1, total: 4 },
        }),
      },
      repoRoot,
    );

    const application = rows.find((row) => row.id === "application");
    expect(application?.files).toBe(1);
    expect(application?.metrics.lines.covered).toBe(6);
    expect(application?.metrics.lines.total).toBe(10);
    expect(application?.metrics.branches.pct).toBe(25);

    // A vendored primitive is not quietly folded into the Application figure.
    expect(rows.find((row) => row.id === "application-ui")?.files).toBe(0);

    const desktop = rows.find((row) => row.id === "desktop-runtime");
    expect(desktop?.metrics.lines.covered).toBe(3);
    expect(desktop?.metrics.lines.total).toBe(6);

    // The "total" key is vitest's own aggregate, not a file.
    expect(rows.reduce((sum, row) => sum + row.files, 0)).toBe(2);
  });

  it("renders a readable per-subsystem report", () => {
    const report = scope.formatSubsystemReport(
      scope.aggregateBySubsystem(
        {
          [toAbsolute("src/lib/a.ts")]: entry({
            lines: { covered: 1, total: 2 },
            statements: { covered: 1, total: 2 },
            functions: { covered: 1, total: 2 },
            branches: { covered: 1, total: 2 },
          }),
        },
        repoRoot,
      ),
    );
    expect(report).toContain("Application");
    expect(report).toMatch(/50\.0%/);
  });

  it("keeps vendored primitives out by explicit path, not a broad directory", () => {
    for (const vendored of [
      "src/components/ui/badge.tsx",
      "src/components/ui/button.tsx",
      "src/components/ui/context-menu.tsx",
    ]) {
      expect(scope.isCoverageExcluded(vendored)).toBe(true);
      expect(scope.exclusionFor(vendored)?.kind).toBe("vendored");
      expect(scope.exclusionFor(vendored)?.reason).toBeTruthy();
      // An explicit path, never the whole ui/ directory.
      expect(
        scope.COVERAGE_EXCLUDES.some((rule) => rule.root === "src/components/ui"),
      ).toBe(false);
    }
    // First-party components beside them stay measured.
    expect(scope.isCoverageExcluded("src/components/ui/foleyard.tsx")).toBe(false);
    expect(scope.isCoverageExcluded("src/components/ui/waveform.tsx")).toBe(false);
  });

  it("treats the changed-code gate as product source only", () => {
    expect(scope.isCoverageIncluded("scripts/postinstall.cjs")).toBe(true);
    expect(scope.isCoverageExcluded("scripts/postinstall.cjs")).toBe(false);
    // Dev harnesses are declared out rather than silently measured.
    expect(scope.exclusionFor("scripts/benchmark-scan.ts")?.kind).toBe("dev-tooling");
    expect(scope.exclusionFor("scripts/performance/run.mjs")?.kind).toBe("dev-tooling");
    // Tests, fixtures and prototypes are never product paths.
    expect(scope.isCoverageExcluded("src/test/integration/foo.test.ts")).toBe(true);
    expect(scope.isCoverageExcluded("src/app/prototype/variant-i.tsx")).toBe(true);
    expect(scope.isCoverageExcluded("src/types/better-sqlite3.d.ts")).toBe(true);
  });

  it("declares every product file on disk, so new files cannot skip review", () => {
    const candidates = walkFiles(repoRoot).filter((rel) => scope.isCoverageCandidate(rel));
    expect(candidates.length).toBeGreaterThan(200);

    const undeclared = candidates.filter(
      (rel) => !scope.isCoverageExcluded(rel) && scope.classifySubsystem(rel) === null,
    );
    expect(
      undeclared,
      "Every product file must be either covered by a subsystem or listed in " +
        "COVERAGE_EXCLUDES with a reason. Add the file to scripts/coverage-scope.cjs.",
    ).toEqual([]);
  });

  it("keeps no stale exclusions behind", () => {
    const stale = scope.COVERAGE_EXCLUDES.filter((rule) => {
      if (rule.path) return !fs.existsSync(toAbsolute(rule.path));
      if (rule.root) return !fs.existsSync(toAbsolute(rule.root));
      return false; // suffix rules are validated by the candidate walk above
    }).map((rule) => rule.path ?? rule.root);
    expect(stale).toEqual([]);
  });

  it("publishes one shape of coverage scope for vitest.config.ts", () => {
    const config = scope.coverageConfig();
    expect(config.include).toContain("src/**/*.{ts,tsx}");
    expect(config.include).toContain("electron/**/*.cjs");
    expect(config.include).toContain("scripts/**/*.{cjs,ts}");
    expect(config.exclude).toContain("src/test/**");
    expect(config.exclude).toContain("src/components/ui/button.tsx");
    expect(config.exclude).not.toContain("src/components/ui/**");

    // Each subsystem gets an aggregate floor keyed by its roots.
    for (const subsystem of scope.SUBSYSTEMS) {
      for (const glob of subsystem.roots.map((root) => `${root}/**`)) {
        expect(config.thresholds[glob], `${subsystem.id} (${glob})`).toBeTruthy();
      }
      for (const metricName of ["lines", "statements", "functions", "branches"]) {
        expect(subsystem.floors[metricName], `${subsystem.id}.${metricName}`).toBeTypeOf("number");
      }
    }
  });

  it("wires vitest.config.ts to the shared scope instead of hand-listing it", () => {
    const configSource = fs.readFileSync(path.join(repoRoot, "vitest.config.ts"), "utf8");
    expect(configSource).toContain("./scripts/coverage-scope.cjs");
    expect(configSource).toContain("coverageConfig()");
    expect(configSource).toContain("GLOBAL_FLOORS");
  });
});

describe("changed-code coverage", () => {
  it("extracts added line numbers from a unified diff", () => {
    const diff = [
      "diff --git a/src/lib/a.ts b/src/lib/a.ts",
      "index 111..222 100644",
      "--- a/src/lib/a.ts",
      "+++ b/src/lib/a.ts",
      "@@ -1,0 +2,3 @@",
      "+const a = 1;",
      "+const b = 2;",
      "+const c = 3;",
      "@@ -10 +13,2 @@",
      "-const old = 4;",
      "+const d = 5;",
      "+const e = 6;",
      "@@ -30,2 +32,2 @@",
      " unchanged context line",
      "-const removed = 7;",
      "+const f = 8;",
      "diff --git a/docs/notes.md b/docs/notes.md",
      "--- a/docs/notes.md",
      "+++ b/docs/notes.md",
      "@@ -0,0 +1 @@",
      "+a doc line",
    ].join("\n");

    expect(changed.parseChangedLines(diff)).toEqual({
      "src/lib/a.ts": [2, 3, 4, 13, 14, 33],
      "docs/notes.md": [1],
    });
  });

  it("flags a changed line whose instrumented units never ran", () => {
    const coverageEntry = {
      statementMap: {
        0: { start: { line: 10 }, end: { line: 10 } },
        1: { start: { line: 12 }, end: { line: 12 } },
      },
      s: { 0: 3, 1: 0 },
      fnMap: { 0: { decl: { start: { line: 20 }, end: { line: 22 } } } },
      f: { 0: 0 },
      branchMap: {},
      b: {},
    };

    // Line 11 has no instrumented unit, so it is not a finding on its own.
    expect(changed.uncoveredLinesInFile(coverageEntry, [10, 11, 12, 20])).toEqual([12, 20]);
  });

  it("reports uncovered changed product lines and ignores everything else", () => {
    const coverageFinal = {
      [toAbsolute("src/lib/changed.ts")]: {
        statementMap: { 0: { start: { line: 5 }, end: { line: 5 } } },
        s: { 0: 0 },
        fnMap: {},
        f: {},
        branchMap: {},
        b: {},
      },
      [toAbsolute("src/lib/covered.ts")]: {
        statementMap: { 0: { start: { line: 5 }, end: { line: 5 } } },
        s: { 0: 1 },
        fnMap: {},
        f: {},
        branchMap: {},
        b: {},
      },
    };

    const findings = changed.findUncoveredChangedLines({
      changedByFile: {
        "src/lib/changed.ts": [5],
        "src/lib/covered.ts": [5],
        "src/lib/never-loaded.ts": [7],
        "src/test/integration/thing.test.ts": [9],
        "docs/notes.md": [1],
      },
      coverageFinal,
      rootDir: repoRoot,
    });

    expect(findings).toEqual([
      { file: "src/lib/changed.ts", lines: [5] },
      // A changed product file that nothing loaded is entirely uncovered.
      { file: "src/lib/never-loaded.ts", lines: [7] },
    ]);
  });

  it("passes cleanly, and fails loudly on missing artifacts or an unknown base ref", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "foleyard-changed-"));
    try {
      const coveragePath = path.join(dir, "coverage-final.json");
      fs.writeFileSync(
        coveragePath,
        JSON.stringify({
          [toAbsolute("src/lib/a.ts")]: {
            statementMap: { 0: { start: { line: 5 }, end: { line: 5 } } },
            s: { 0: 1 },
            fnMap: {},
            f: {},
            branchMap: {},
            b: {},
          },
        }),
      );
      const messages: string[] = [];
      const log = (message: string) => messages.push(message);
      const error = (message: string) => messages.push(message);

      // HEAD...HEAD is an empty diff: nothing changed, nothing to gate.
      expect(changed.run({ baseRef: "HEAD", coveragePath, rootDir: repoRoot, log, error })).toBe(0);
      expect(messages.join("\n")).toMatch(/changed product file/);

      expect(
        changed.run({
          baseRef: "HEAD",
          coveragePath: path.join(dir, "missing.json"),
          rootDir: repoRoot,
          log,
          error,
        }),
      ).toBe(1);

      expect(
        changed.run({
          baseRef: "definitely-not-a-ref-xyz",
          coveragePath,
          rootDir: repoRoot,
          log,
          error,
        }),
      ).toBe(1);
      expect(messages.join("\n")).toMatch(/cannot diff/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("fails the run and names each uncovered changed line", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "foleyard-changed-fail-"));
    try {
      const coveragePath = path.join(dir, "coverage-final.json");
      fs.writeFileSync(coveragePath, JSON.stringify({}));
      const messages: string[] = [];
      const code = changed.run({
        baseRef: "HEAD",
        coveragePath,
        rootDir: repoRoot,
        // A changed product file nothing loaded: every changed line is uncovered.
        changedByFile: { "src/lib/added.ts": [4, 5] },
        log: (message) => messages.push(message),
        error: (message) => messages.push(message),
      });

      expect(code).toBe(1);
      const output = messages.join("\n");
      expect(output).toMatch(/uncovered changed lines/);
      expect(output).toMatch(/src\/lib\/added\.ts: 4, 5/);
      expect(output).toMatch(/2 changed line\(s\) in 1 file\(s\)/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("dispatches from the command line through main()", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "foleyard-changed-main-"));
    const previous = {
      base: process.env.COVERAGE_BASE_REF,
      path: process.env.COVERAGE_FINAL_PATH,
      exit: process.exitCode,
    };
    try {
      const coveragePath = path.join(dir, "coverage-final.json");
      fs.writeFileSync(coveragePath, JSON.stringify({}));
      process.env.COVERAGE_BASE_REF = "HEAD";
      process.env.COVERAGE_FINAL_PATH = coveragePath;

      changed.main();

      expect(process.exitCode).toBe(0);
    } finally {
      for (const [key, value] of [
        ["COVERAGE_BASE_REF", previous.base],
        ["COVERAGE_FINAL_PATH", previous.path],
      ] as const) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      process.exitCode = previous.exit ?? 0;
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("coverage report CLI", () => {
  it("writes a machine-readable subsystem artifact beside the summary", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "foleyard-report-"));
    try {
      const summaryPath = path.join(dir, "coverage-summary.json");
      fs.writeFileSync(
        summaryPath,
        JSON.stringify({
          total: entry({ lines: { covered: 1, total: 2 } }),
          [toAbsolute("src/lib/a.ts")]: entry({
            lines: { covered: 1, total: 2 },
            statements: { covered: 1, total: 2 },
            functions: { covered: 1, total: 1 },
            branches: { covered: 1, total: 2 },
          }),
        }),
      );
      const artifactPath = path.join(dir, "subsystem-summary.json");
      const messages: string[] = [];
      const code = report.run({
        summaryPath,
        rootDir: repoRoot,
        artifactPath,
        log: (message) => messages.push(message),
        error: (message) => messages.push(message),
      });

      expect(code).toBe(0);
      expect(messages.join("\n")).toContain("Application");
      const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8")) as {
        globalFloors: { lines: number };
        subsystems: Array<{
          id: string;
          files: number;
          metrics: { lines: { covered: number; total: number; pct: number } };
          floors: { lines: number };
        }>;
      };
      const application = artifact.subsystems.find((row) => row.id === "application");
      expect(application?.files).toBe(1);
      expect(application?.metrics.lines).toEqual({ covered: 1, total: 2, pct: 50 });
      expect(application?.floors.lines).toBe(42);
      expect(artifact.globalFloors.lines).toBe(52);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("fails loudly when the coverage summary is missing", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "foleyard-report-missing-"));
    try {
      const messages: string[] = [];
      const code = report.run({
        summaryPath: path.join(dir, "missing.json"),
        rootDir: repoRoot,
        artifactPath: path.join(dir, "unused.json"),
        log: (message) => messages.push(message),
        error: (message) => messages.push(message),
      });
      expect(code).toBe(1);
      expect(messages.join("\n")).toMatch(/missing/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("dispatches from the command line through main()", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "foleyard-report-main-"));
    const previous = {
      summary: process.env.COVERAGE_SUMMARY_PATH,
      artifact: process.env.COVERAGE_ARTIFACT_PATH,
      exit: process.exitCode,
    };
    try {
      const summaryPath = path.join(dir, "coverage-summary.json");
      const artifactPath = path.join(dir, "subsystem-summary.json");
      fs.writeFileSync(summaryPath, JSON.stringify({ total: entry({ lines: { covered: 0, total: 0 } }) }));
      process.env.COVERAGE_SUMMARY_PATH = summaryPath;
      process.env.COVERAGE_ARTIFACT_PATH = artifactPath;

      report.main();

      expect(process.exitCode).toBe(0);
      expect(fs.existsSync(artifactPath)).toBe(true);
    } finally {
      for (const [key, value] of [
        ["COVERAGE_SUMMARY_PATH", previous.summary],
        ["COVERAGE_ARTIFACT_PATH", previous.artifact],
      ] as const) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      process.exitCode = previous.exit ?? 0;
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
