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
