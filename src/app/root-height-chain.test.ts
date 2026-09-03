import fs from "node:fs";

import { describe, expect, it } from "vitest";

// The app applies CSS zoom to the root element (see src/hooks/use-zoom.ts),
// and viewport units do not track root zoom: at zoom < 100% the workspace
// collapsed into the top half of the window (#13). The root height chain
// must therefore use percentage heights only. This repo has no layout
// engine (no headless browser), so no test can assert rendered heights;
// this guard locks the bug pattern at its source instead.
describe("root height chain", () => {
  it("uses percentage heights, not viewport units", () => {
    const globals = fs.readFileSync(
      new URL("./globals.css", import.meta.url),
      "utf8",
    );
    const page = fs.readFileSync(
      new URL("./page.tsx", import.meta.url),
      "utf8",
    );

    expect(globals, "body height must not use viewport units").not.toMatch(
      /height:\s*100vh/,
    );
    expect(page, "workspace root must not use h-screen").not.toMatch(
      /h-screen/,
    );
  });
});
