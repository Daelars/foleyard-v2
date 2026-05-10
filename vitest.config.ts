import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: [
      "packages/yard-tools/**/*.test.ts",
      "src/**/*.test.ts",
    ],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@yard-core": path.resolve(__dirname, "packages/yard-core/src/index.ts"),
    },
  },
});
