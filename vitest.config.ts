import { configDefaults, defineConfig } from "vitest/config";
import path from "path";

// Coverage scope, exclusions and subsystem floors live in one place
// (scripts/coverage-scope.cjs) so the thresholds, the per-subsystem report and
// the changed-code gate cannot drift. See issue #303 and docs/development.md.
//
// Collect by pattern, not by tree root. Naming three roots meant a test placed
// under electron/ or scripts/ was silently never run, and only *.test.ts was
// matched, so a *.test.tsx file would vanish too. test-collection.test.ts holds
// this to the repo's actual contents; UNCOLLECTED_BY_DESIGN there is the one
// place a test file is allowed to sit outside this pattern.
import coverageScope from "./scripts/coverage-scope.cjs";

const coverage = coverageScope.coverageConfig();

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["**/*.test.{ts,tsx}"],
    exclude: [...configDefaults.exclude, "docs/**", "dist-electron/**"],
    coverage: {
      provider: "v8",
      // Everything matching `include` is reported, executed or not. Files no
      // test ever loads must appear as 0%, not be absent — their absence is how
      // 410 passing tests read as health while a third of the source was never
      // executed. Vitest 4 does this by default; do not narrow `include` to
      // only what tests touch.
      include: coverage.include,
      exclude: coverage.exclude,
      // `json` writes coverage-final.json for the changed-code gate;
      // `json-summary` feeds the per-subsystem report; both are CI artifacts.
      reporter: ["text-summary", "json-summary", "json", "html"],
      reportsDirectory: "coverage",
      // Global floors, plus an independent floor for each shipped subsystem
      // (Application UI, Application server routes, Desktop runtime, Yard Core,
      // Yard Tools, build and release scripts). Floors sit one point below the
      // measured baseline; raise them as coverage rises, never lower them to
      // make a run pass.
      thresholds: {
        ...coverageScope.GLOBAL_FLOORS,
        ...coverage.thresholds,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@yard-core": path.resolve(__dirname, "packages/yard-core/src/index.ts"),
      "yard-core": path.resolve(__dirname, "packages/yard-core/src/index.ts"),
      "@foleyard/make-pack-v2": path.resolve(
        __dirname,
        "packages/yard-tools/make-pack-v2/src/index.ts",
      ),
      "@foleyard/sound-shelf-v2": path.resolve(
        __dirname,
        "packages/yard-tools/sound-shelf-v2/src/index.ts",
      ),
      "@foleyard/smart-collections-v2": path.resolve(
        __dirname,
        "packages/yard-tools/smart-collections-v2/src/index.ts",
      ),
      "@foleyard/folder-janitor-v2": path.resolve(
        __dirname,
        "packages/yard-tools/folder-janitor-v2/src/index.ts",
      ),
      "@foleyard/library-gatherer-v2": path.resolve(
        __dirname,
        "packages/yard-tools/library-gatherer-v2/src/index.ts",
      ),
      "@foleyard/drop-rules-v2": path.resolve(
        __dirname,
        "packages/yard-tools/drop-rules-v2/src/index.ts",
      ),
      "@foleyard/auto-tag-v2": path.resolve(
        __dirname,
        "packages/yard-tools/auto-tag-v2/src/index.ts",
      ),
    },
  },
});
