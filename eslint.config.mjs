import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

import foleyardTheme from "./eslint/foleyard-theme.mjs";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["**/*.cjs"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  // Theme-token law and root-height chain (#142): fail at author time.
  // Throwaway prototypes are exempt by design; item-colors.ts defines the
  // preset palette itself.
  {
    files: ["src/app/**/*.tsx", "src/components/**/*.tsx"],
    ignores: ["src/app/prototype/**", "**/*.test.*"],
    plugins: { "foleyard-theme": foleyardTheme },
    rules: {
      "foleyard-theme/no-hardcoded-accent-hex": "error",
      "foleyard-theme/no-old-skin-tokens": "error",
    },
  },
  {
    files: ["src/app/**/*.{ts,tsx}"],
    ignores: ["src/app/prototype/**", "**/*.test.*"],
    plugins: { "foleyard-theme": foleyardTheme },
    rules: {
      "foleyard-theme/no-viewport-height-units": "error",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Generated output, not source:
    "coverage/**",
  ]),
]);

export default eslintConfig;
