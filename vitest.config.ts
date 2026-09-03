import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: [
      "packages/yard-core/**/*.test.ts",
      "packages/yard-tools/**/*.test.ts",
      "src/**/*.test.ts",
    ],
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
