import { createRequire } from "node:module";
import { Module } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { getDocumentationLocation } from "@/lib/documentation";
import { getServerRuntimeSnapshot } from "@/lib/runtime-info";

// Area: #307. Installed-documentation matching must fail closed. One reader
// supplies the running build identity to both the runtime snapshot and the
// docs match verdict, a staged manifest cannot be called matched when the
// expected build/source identity is missing, and runtime output carries no
// private local paths. Tests build real packaged provenance rather than
// hand-writing incomplete identity environment values.

const REPO_ROOT = process.cwd();
const created: string[] = [];

function tempDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  created.push(dir);
  return dir;
}

function productVersion(): string {
  return JSON.parse(
    fs.readFileSync(path.join(REPO_ROOT, "package.json"), "utf8"),
  ).version as string;
}

/** A packaged app root; `null` builds the provenance-less failure case. */
function appRoot(provenance: Record<string, unknown> | null): string {
  const dir = tempDir("foleyard-app-");
  if (provenance) {
    fs.mkdirSync(path.join(dir, ".next"), { recursive: true });
    fs.writeFileSync(
      path.join(dir, ".next", "build-provenance.json"),
      JSON.stringify(provenance),
    );
  }
  return dir;
}

/** A staged docs root whose manifest carries the given identity fields. */
function stagedRoot(identity: Record<string, unknown>): string {
  const dir = tempDir("foleyard-staged-");
  fs.mkdirSync(path.join(dir, "docs"), { recursive: true });
  fs.writeFileSync(path.join(dir, "docs", "index.md"), "# Index\n");
  fs.writeFileSync(
    path.join(dir, "manifest.json"),
    JSON.stringify({
      manifestId: "foleyard-docs",
      documents: [{ id: "index", path: "docs/index.md" }],
      ...identity,
    }),
  );
  return dir;
}

/**
 * Point the app at packaged provenance + staged docs. cwd is redirected to an
 * empty directory so the reader cannot accidentally find the checkout's
 * `.next` and pass with the wrong identity.
 */
function usePackaged(appDir: string, docsDir: string): void {
  vi.stubEnv("FOLEYARD_APP_PATH", appDir);
  vi.stubEnv("FOLEYARD_DOCS_ROOT", docsDir);
  vi.stubEnv("FOLEYARD_SOURCE_REVISION", undefined);
  vi.stubEnv("FOLEYARD_SOURCE_DIRTY", undefined);
  vi.spyOn(process, "cwd").mockReturnValue(tempDir("foleyard-cwd-"));
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  for (const dir of created.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe("installed documentation identity (#307)", () => {
  it("matches only when the staged manifest agrees with packaged provenance", () => {
    const appDir = appRoot({
      buildId: "build-running",
      sourceRevision: "rev-running",
      sourceDirty: false,
    });
    const docsDir = stagedRoot({
      productVersion: productVersion(),
      buildId: "build-running",
      sourceRevision: "rev-running",
    });
    usePackaged(appDir, docsDir);

    const location = getDocumentationLocation();
    expect(location.matched).toBe(true);
    expect(location.matchState).toBe("matched");
    expect(location.mismatches).toEqual([]);
    expect(location.manifest?.buildId).toBe("build-running");
    expect(location.manifest?.sourceRevision).toBe("rev-running");
  });

  it("rejects a staged manifest whose build identity differs from the running build", () => {
    const appDir = appRoot({
      buildId: "build-running",
      sourceRevision: "rev-running",
      sourceDirty: false,
    });
    const docsDir = stagedRoot({
      productVersion: productVersion(),
      buildId: "build-staged",
      sourceRevision: "rev-staged",
    });
    usePackaged(appDir, docsDir);

    const location = getDocumentationLocation();
    expect(location.matched).toBe(false);
    expect(location.matchState).toBe("mismatched");
    expect(location.mismatches).toEqual(
      expect.arrayContaining([
        { field: "buildId", expected: "build-running", actual: "build-staged" },
        { field: "sourceRevision", expected: "rev-running", actual: "rev-staged" },
      ]),
    );
  });

  it("fails closed when the running build identity is missing", () => {
    const appDir = appRoot(null);
    const docsDir = stagedRoot({
      productVersion: productVersion(),
      buildId: "build-staged",
      sourceRevision: "rev-staged",
    });
    usePackaged(appDir, docsDir);

    const location = getDocumentationLocation();
    expect(location.matched).toBe(false);
    expect(location.matchState).toBe("mismatched");
    expect(location.mismatches).toEqual(
      expect.arrayContaining([
        { field: "buildId", expected: "absent", actual: "build-staged" },
        { field: "sourceRevision", expected: "absent", actual: "rev-staged" },
      ]),
    );
  });

  it("fails closed when the build provenance is unreadable", () => {
    const appDir = tempDir("foleyard-app-");
    fs.mkdirSync(path.join(appDir, ".next"), { recursive: true });
    fs.writeFileSync(path.join(appDir, ".next", "build-provenance.json"), "{ not json");
    const docsDir = stagedRoot({
      productVersion: productVersion(),
      buildId: "build-staged",
      sourceRevision: "rev-staged",
    });
    usePackaged(appDir, docsDir);

    const location = getDocumentationLocation();
    expect(location.matched).toBe(false);
    expect(location.matchState).toBe("mismatched");
    expect(location.mismatches).toEqual(
      expect.arrayContaining([
        { field: "buildId", expected: "absent", actual: "build-staged" },
        { field: "sourceRevision", expected: "absent", actual: "rev-staged" },
      ]),
    );
  });

  it("fails closed when the staged manifest identity is missing", () => {
    const appDir = appRoot({
      buildId: "build-running",
      sourceRevision: "rev-running",
      sourceDirty: false,
    });
    const docsDir = stagedRoot({ productVersion: productVersion() });
    usePackaged(appDir, docsDir);

    const location = getDocumentationLocation();
    expect(location.matched).toBe(false);
    expect(location.matchState).toBe("mismatched");
    expect(location.mismatches).toEqual(
      expect.arrayContaining([
        { field: "buildId", expected: "build-running", actual: "absent" },
        { field: "sourceRevision", expected: "rev-running", actual: "absent" },
      ]),
    );
    for (const mismatch of location.mismatches) {
      expect(mismatch.expected).not.toMatch(/[\\/]/);
      expect(mismatch.actual).not.toMatch(/[\\/]/);
    }
  });

  it("reports only the running identity's build id and revision, not a second source", () => {
    // A lone BUILD_ID with no provenance file must resolve through the same
    // reader the runtime snapshot uses.
    const appDir = tempDir("foleyard-app-");
    fs.mkdirSync(path.join(appDir, ".next"), { recursive: true });
    fs.writeFileSync(path.join(appDir, ".next", "BUILD_ID"), "build-from-file\n");
    const docsDir = stagedRoot({
      productVersion: productVersion(),
      buildId: "build-from-file",
      sourceRevision: "rev-running",
    });
    usePackaged(appDir, docsDir);
    vi.stubEnv("FOLEYARD_SOURCE_REVISION", "rev-running");

    const location = getDocumentationLocation();
    expect(location.matched).toBe(true);
    expect(location.manifest?.buildId).toBe("build-from-file");
  });

  it("keeps private local paths out of the runtime snapshot", () => {
    const snapshot = getServerRuntimeSnapshot();
    const json = JSON.stringify(snapshot);
    expect(json).not.toContain(REPO_ROOT);
    expect(json).not.toContain(os.homedir());
    const documentation = snapshot.documentation as
      | (Record<string, unknown> & { matchState?: string })
      | undefined;
    expect(documentation).toBeDefined();
    expect(documentation).not.toHaveProperty("localRoot");
    expect(documentation?.matchState).toBe("unversioned");
  });

  it("redacts desktop resource paths from runtime introspection", () => {
    const privateRoot = tempDir("foleyard-private-root-");
    const appDir = tempDir("foleyard-desktop-app-");
    const originalResourcesPath = (process as { resourcesPath?: string }).resourcesPath;
    Object.defineProperty(process, "resourcesPath", {
      configurable: true,
      value: privateRoot,
    });

    try {
      const identity = loadDesktopIdentity({
        app: { isPackaged: true, getAppPath: () => appDir, getVersion: () => "1.2.3" },
        ipcMain: { listenerCount: () => 0, _invokeHandlers: new Map() },
      });
      expect(identity).not.toHaveProperty("resourcesPath");
      expect(identity).not.toHaveProperty("docsRoot");
      expect(JSON.stringify(identity)).not.toContain(privateRoot);
      expect(JSON.stringify(identity)).not.toContain(appDir);
      expect(identity).toMatchObject({ owner: "desktop", packaged: true, version: "1.2.3" });
    } finally {
      if (originalResourcesPath === undefined) {
        delete (process as { resourcesPath?: string }).resourcesPath;
      } else {
        Object.defineProperty(process, "resourcesPath", {
          configurable: true,
          value: originalResourcesPath,
        });
      }
    }
  });
});

// --- desktop identity loader (electron main is CommonJS) -------------------

const cjsRequire = createRequire(import.meta.url);
type LoadFn = (this: unknown, request: string, ...rest: unknown[]) => unknown;
const ModuleWithLoad = Module as unknown as { _load: LoadFn };
const originalLoad = ModuleWithLoad._load;

function loadDesktopIdentity(fakeElectron: unknown): Record<string, unknown> {
  ModuleWithLoad._load = function (request: string, ...rest: unknown[]) {
    if (request === "electron") return fakeElectron;
    return originalLoad.call(this, request, ...rest);
  };
  try {
    for (const key of Object.keys(cjsRequire.cache)) {
      if (key.includes("runtime-info.cjs")) delete cjsRequire.cache[key];
    }
    const mod = cjsRequire(
      path.join(REPO_ROOT, "electron", "main", "runtime-info.cjs"),
    ) as { getDesktopIdentity: () => Record<string, unknown> };
    return mod.getDesktopIdentity();
  } finally {
    ModuleWithLoad._load = originalLoad;
  }
}
