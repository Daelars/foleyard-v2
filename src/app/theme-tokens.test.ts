import fs from "node:fs";

import { describe, expect, it } from "vitest";

// Token law (#16) is binding: the ratified visual-language values live in the
// shared theme layer, and ported surfaces carry no hard-coded accent values.
// This repo has no headless browser, so pixels can't be asserted; this guard
// locks the rule at its source instead — the same shape as the root-height
// guard. It grows as later slices port more surfaces.
describe("theme token law", () => {
  const globals = fs.readFileSync(
    new URL("./globals.css", import.meta.url),
    "utf8",
  );

  it("defines the ratified accent and canvas tokens in the theme layer", () => {
    for (const token of [
      "--accent-fill: #f0503c",
      "--accent-fill-hover: #ff5a44",
      "--accent-text: #ff7a66",
      "--canvas: #0b0b10",
      "--shell: #101014",
    ]) {
      expect(globals, `theme layer must define ${token}`).toContain(token);
    }
  });

  it("registers the accent tokens as Tailwind color utilities", () => {
    for (const token of [
      "--color-accent-fill:",
      "--color-accent-fill-hover:",
      "--color-accent-text:",
      "--color-canvas:",
      "--color-shell:",
    ]) {
      expect(globals, `@theme must register ${token}`).toContain(token);
    }
  });

  it("keeps hard-coded accent hex values out of the ported app surface", () => {
    const page = fs.readFileSync(
      new URL("./page.tsx", import.meta.url),
      "utf8",
    );
    for (const hex of [/#f0503c/i, /#ff5a44/i, /#ff7a66/i]) {
      expect(page, `page.tsx must not hard-code ${hex.source}`).not.toMatch(hex);
    }
  });
});
