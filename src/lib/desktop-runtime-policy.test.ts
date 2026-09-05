import { registerGrant, resolveGrantedExistingPath } from "./filesystem-boundary";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

import { afterEach, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { DEV_SERVER_URL } = require("../../electron/main/constants.cjs") as {
  DEV_SERVER_URL: string;
};
const { getDesktopServerUrl, setDesktopServerUrl } = require(
  "../../electron/main/server-url.cjs",
) as {
  getDesktopServerUrl: () => string;
  setDesktopServerUrl: (startUrl: string) => void;
};
afterEach(() => {
  setDesktopServerUrl(DEV_SERVER_URL);
});

describe("desktop server URL selection", () => {
  it("uses the origin of the server that owns the renderer window", () => {
    setDesktopServerUrl("http://127.0.0.1:49152/library?view=all");

    expect(getDesktopServerUrl()).toBe("http://127.0.0.1:49152");
  });
});

describe("desktop build metadata policy", () => {
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8"),
  ) as { scripts: Record<string, string> };

  it.each(["build:desktop", "release", "release:build"])(
    "%s does not enable disposable-build metadata",
    (scriptName) => {
      expect(packageJson.scripts[scriptName]).not.toContain(
        "foleyardOpenDevTools=true",
      );
      expect(packageJson.scripts[scriptName]).not.toContain(
        "foleyardResetDatabaseOnBuild=true",
      );
    },
  );

  it("keeps disposable data and DevTools behind an explicit command", () => {
    const script = packageJson.scripts["build:desktop:disposable"];

    expect(script).toContain("foleyardOpenDevTools=true");
    expect(script).toContain("foleyardResetDatabaseOnBuild=true");
  });
});

describe("desktop chosen-folder grants", () => {
  it("allows a chosen folder and its descendants, but not sibling paths", async () => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), "foleyard-grant-"));
    const chosen = path.join(temp, "chosen");
    const child = path.join(chosen, "pack", "hit.wav");
    const sibling = path.join(temp, "private.txt");
    fs.mkdirSync(path.dirname(child), { recursive: true });
    fs.writeFileSync(child, "audio");
    fs.writeFileSync(sibling, "private");

    try {
      await registerGrant(chosen);
      // Same canonicalization call the implementation uses (see above).
      expect(await resolveGrantedExistingPath(child)).toBe(await fs.promises.realpath(child));
      expect(await resolveGrantedExistingPath(sibling)).toBeNull();
    } finally {
      fs.rmSync(temp, { recursive: true, force: true });
    }
  });
});
