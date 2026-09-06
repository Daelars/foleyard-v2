import { configDefaults, defineConfig } from "vitest/config";
import path from "path";

// Collect by pattern, not by tree root. Naming three roots meant a test placed
// under electron/ or scripts/ was silently never run, and only *.test.ts was
// matched, so a *.test.tsx file would vanish too. test-collection.test.ts holds
// this to the repo's actual contents; UNCOLLECTED_BY_DESIGN there is the one
// place a test file is allowed to sit outside this pattern.
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
      include: ["src/**/*.{ts,tsx}", "packages/**/src/**/*.{ts,tsx}"],
      exclude: [
        "**/*.test.{ts,tsx}",
        "**/*.d.ts",
        // Shared test fixtures: exercised by tests, not product code.
        "src/test/**",
        // Generated shadcn primitives: vendored, not our behaviour to assert.
        "src/components/ui/**",
        // Throwaway prototypes, deleted when their design question is answered.
        "src/app/prototype/**",
        // Next.js framework entrypoints with no logic of their own.
        "src/app/{layout,globals}.{ts,tsx}",
        "**/index.ts",
      ],
      reporter: ["text-summary", "json-summary", "html"],
      reportsDirectory: "coverage",
      // Measured 2026-09-05 and recorded in docs/test-coverage-baseline.md,
      // rounded down a point so ordinary churn does not fail the run. Raise
      // these as coverage rises; never lower them to make a run pass.
      thresholds: {
        lines: 37.5,
        branches: 31,
        functions: 34,
        statements: 36.5,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@yard-core": path.resolve(__dirname, "packages/yard-core/src/index.ts"),
      "yard-core": path.resolve(__dirname, "packages/yard-core/src/index.ts"),
      "@foleyard/sound-shelf": path.resolve(
        __dirname,
        "packages/yard-tools/sound-shelf/src/index.ts",
      ),
      "@foleyard/make-pack": path.resolve(
        __dirname,
        "packages/yard-tools/make-pack/src/index.ts",
      ),
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
      "@foleyard/drop-rules": path.resolve(
        __dirname,
        "packages/yard-tools/drop-rules/src/index.ts",
      ),
      "@foleyard/folder-janitor": path.resolve(
        __dirname,
        "packages/yard-tools/folder-janitor/src/index.ts",
      ),
      "@foleyard/library-gatherer": path.resolve(
        __dirname,
        "packages/yard-tools/library-gatherer/src/index.ts",
      ),
      "@foleyard/smart-collections": path.resolve(
        __dirname,
        "packages/yard-tools/smart-collections/src/index.ts",
      ),
    },
  },
});
