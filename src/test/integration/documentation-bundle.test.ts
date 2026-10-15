import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";

import {
  getDocumentationLocation,
  getDocumentationRegistry,
  readDocumentation,
  listDocumentIds,
} from "@/lib/documentation";
import { initializeDatabaseSchema, getDatabaseVersionInfo, CURRENT_SCHEMA_VERSION } from "@/lib/database/migrations";
import { getServerRuntimeSnapshot } from "@/lib/runtime-info";

const REPO_ROOT = process.cwd();

function readManifest(): {
  documents: Array<{ id: string; path: string; title: string; status: string }>;
} {
  return JSON.parse(
    fs.readFileSync(path.join(REPO_ROOT, "docs", "manifest.json"), "utf8"),
  );
}

describe("documentation bundle contracts", () => {
  it("resolves known document IDs and rejects traversal/unknown IDs", () => {
    expect(listDocumentIds()).toContain("index");
    expect(listDocumentIds()).toContain("commands");
    const doc = readDocumentation("index");
    expect(doc.content.length).toBeGreaterThan(100);
    expect(() => readDocumentation("nope-missing")).toThrow(/Unknown document/);
    expect(() => readDocumentation("../package.json")).toThrow(/Unknown document/);
    expect(() => readDocumentation("..")).toThrow(/Unknown document/);
    expect(() => readDocumentation("")).toThrow(/Unknown document/);
  });

  it("serves exactly the documents declared in docs/manifest.json", () => {
    const manifest = readManifest();
    const registry = getDocumentationRegistry();
    expect(registry.documents.map((doc) => doc.id)).toEqual(
      manifest.documents.map((doc) => doc.id),
    );
    expect(registry.documents.map((doc) => doc.relativePath)).toEqual(
      manifest.documents.map((doc) => doc.path),
    );
    expect(listDocumentIds()).toEqual(manifest.documents.map((doc) => doc.id));
    for (const doc of manifest.documents) {
      expect(fs.existsSync(path.join(REPO_ROOT, doc.path)), `missing ${doc.path}`).toBe(true);
    }
  });

  it("derives the runnable example list from the examples directory", () => {
    const raw = JSON.parse(
      fs.readFileSync(path.join(REPO_ROOT, "docs", "manifest.json"), "utf8"),
    ) as { examples?: unknown };
    expect(raw.examples, "the manifest must not hardcode examples").toBeUndefined();

    const ids = getDocumentationLocation().examples.map((example) => example.id);
    expect(ids).toContain("core/query-library");
    expect(ids).toContain("extensions-v2/minimal");
    expect(ids).toContain("extensions-v2/settings");
    for (const id of ids) {
      const dir = path.join(REPO_ROOT, "examples", id);
      expect(fs.existsSync(path.join(dir, "run.ts")), `missing ${id}/run.ts`).toBe(true);
      expect(fs.existsSync(path.join(dir, "README.md")), `missing ${id}/README.md`).toBe(true);
    }
  });

  it("registers and serves the live expected-failures ledger", () => {
    expect(listDocumentIds()).toContain("expected-failures");
    expect(readDocumentation("expected-failures").content.length).toBeGreaterThan(100);
  });

  it("stages the registry faithfully and fails the check on staged drift", () => {
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "foleyard-docs-"));
    try {
      execFileSync(process.execPath, ["scripts/prepare-docs.cjs", "--out", outDir], {
        cwd: REPO_ROOT,
        stdio: "pipe",
      });
      const check = execFileSync(process.execPath, ["scripts/check-docs.cjs", "--dir", outDir], {
        cwd: REPO_ROOT,
        encoding: "utf8",
      });
      expect(check).toMatch(/staged set matches docs\/manifest\.json/);

      const manifestPath = path.join(outDir, "manifest.json");
      const staged = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as {
        documents: Array<Record<string, unknown>>;
      };
      staged.documents.push({
        id: "ghost",
        path: "docs/ghost.md",
        title: "Ghost",
        status: "current",
        audience: "developers",
        sha256: "0".repeat(64),
      });
      fs.writeFileSync(manifestPath, JSON.stringify(staged, null, 2));

      let failed = false;
      try {
        execFileSync(process.execPath, ["scripts/check-docs.cjs", "--dir", outDir], {
          cwd: REPO_ROOT,
          stdio: "pipe",
        });
      } catch {
        failed = true;
      }
      expect(failed, "a staged document the registry does not declare must fail the check").toBe(true);

      // A served document that references a missing repository path already
      // failed before the manifest drift; check that case on a clean stage.
      const second = fs.mkdtempSync(path.join(os.tmpdir(), "foleyard-docs-paths-"));
      try {
        execFileSync(process.execPath, ["scripts/prepare-docs.cjs", "--out", second], {
          cwd: REPO_ROOT,
          stdio: "pipe",
        });
        fs.appendFileSync(
          path.join(second, "docs", "index.md"),
          "\nSource: `src/does/not/exist.ts`\n",
        );
        let pathFailure = "";
        try {
          execFileSync(process.execPath, ["scripts/check-docs.cjs", "--dir", second], {
            cwd: REPO_ROOT,
            stdio: "pipe",
          });
        } catch (error) {
          pathFailure = String((error as { stderr?: unknown }).stderr ?? error);
        }
        expect(pathFailure, "a missing source-map path must fail the check").toContain(
          "missing repository path",
        );
        expect(pathFailure).toContain("src/does/not/exist.ts");
      } finally {
        fs.rmSync(second, { recursive: true, force: true });
      }
    } finally {
      fs.rmSync(outDir, { recursive: true, force: true });
    }
  }, 60_000);

  it("migration version reflects successful application including baseline", () => {
    const sqlite = new Database(":memory:");
    try {
      initializeDatabaseSchema(sqlite);
      const info = getDatabaseVersionInfo(sqlite);
      expect(info.state).toBe("ready");
      expect(info.migration).toBe("versioned");
      expect(info.appliedVersion).toBe(CURRENT_SCHEMA_VERSION);
      // Re-initializing an existing schema is a safe baseline, not a reset.
      initializeDatabaseSchema(sqlite);
      const again = getDatabaseVersionInfo(sqlite);
      expect(again.appliedVersion).toBe(CURRENT_SCHEMA_VERSION);
    } finally {
      sqlite.close();
    }
  });

  it("unversioned databases report unversioned, not version 0", () => {
    const sqlite = new Database(":memory:");
    try {
      sqlite.exec("CREATE TABLE files (id TEXT PRIMARY KEY)");
      const info = getDatabaseVersionInfo(sqlite);
      expect(info.migration).toBe("unversioned");
      expect(info.appliedVersion).toBeUndefined();
    } finally {
      sqlite.close();
    }
  });

  it("runtime snapshot excludes secrets and sensitive state", () => {
    const snapshot = getServerRuntimeSnapshot();
    const json = JSON.stringify(snapshot);
    expect(json).not.toMatch(/grantToken/i);
    expect(json).not.toMatch(/BEGIN PRIVATE|foleyard\.sqlite-wal/i);
    expect(snapshot.schemaVersion).toBe(1);
    expect(snapshot.identity.product).toBe("Foleyard");
    expect(snapshot.providers.some((p) => p.owner === "renderer" && p.status === "absent")).toBe(true);
    // Identity works without a database; DB section degrades explicitly.
    expect(["ready", "not-initialized", "unavailable"]).toContain(snapshot.database.state);
    expect(snapshot.documentation?.indexId).toBe("index");
    expect(snapshot.limitations.join(" ")).toMatch(/trusted code/);
  });
});

// Area: #240. The docs match verdict comes from the staged manifest, never a
// constant: matched, mismatched (field + both values), absent and
// development-checkout states are all explicit.
describe("docs match verdict", () => {
  const stagedRoots: string[] = [];

  function stagedRoot(manifest: Record<string, unknown> | null): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "foleyard-docs-match-"));
    stagedRoots.push(dir);
    if (manifest) {
      fs.mkdirSync(path.join(dir, "docs"), { recursive: true });
      fs.writeFileSync(path.join(dir, "docs", "index.md"), "# Index\n");
      fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest));
    }
    return dir;
  }

  /** A packaged app root carrying real `.next/build-provenance.json` (#307). */
  function appRoot(provenance: Record<string, unknown>): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "foleyard-docs-app-"));
    stagedRoots.push(dir);
    fs.mkdirSync(path.join(dir, ".next"), { recursive: true });
    fs.writeFileSync(
      path.join(dir, ".next", "build-provenance.json"),
      JSON.stringify(provenance),
    );
    return dir;
  }

  function productVersion(): string {
    return JSON.parse(
      fs.readFileSync(path.join(REPO_ROOT, "package.json"), "utf8"),
    ).version as string;
  }

  afterEach(() => {
    vi.unstubAllEnvs();
    for (const dir of stagedRoots) fs.rmSync(dir, { recursive: true, force: true });
    stagedRoots.length = 0;
  });

  it("matches when the staged manifest agrees with packaged provenance", () => {
    const dir = stagedRoot({
      manifestId: "foleyard-docs",
      productVersion: productVersion(),
      buildId: "build-abc",
      sourceRevision: "rev-abc",
      documents: [{ id: "index", path: "docs/index.md" }],
    });
    vi.stubEnv("FOLEYARD_DOCS_ROOT", dir);
    vi.stubEnv(
      "FOLEYARD_APP_PATH",
      appRoot({ buildId: "build-abc", sourceRevision: "rev-abc", sourceDirty: false }),
    );

    const location = getDocumentationLocation();
    expect(location.matched).toBe(true);
    expect(location.matchState).toBe("matched");
    expect(location.mismatches).toEqual([]);
    expect(location.manifest?.documentCount).toBe(1);
    expect(location.manifest?.productVersion).toBe(productVersion());
  });

  it("names the mismatched field with both values", () => {
    const dir = stagedRoot({
      manifestId: "foleyard-docs",
      productVersion: "0.0.0-old",
      buildId: null,
      sourceRevision: "rev-old",
      documents: [{ id: "index", path: "docs/index.md" }],
    });
    vi.stubEnv("FOLEYARD_DOCS_ROOT", dir);
    vi.stubEnv(
      "FOLEYARD_APP_PATH",
      appRoot({ buildId: "build-new", sourceRevision: "rev-new", sourceDirty: false }),
    );

    const location = getDocumentationLocation();
    expect(location.matched).toBe(false);
    expect(location.matchState).toBe("mismatched");
    expect(location.mismatches).toEqual(
      expect.arrayContaining([
        { field: "productVersion", expected: productVersion(), actual: "0.0.0-old" },
        { field: "sourceRevision", expected: "rev-new", actual: "rev-old" },
      ]),
    );
    // A staged manifest without a build id is unverifiable, so it fails closed
    // rather than being read as "unknown, allow" (#307).
    expect(location.mismatches).toEqual(
      expect.arrayContaining([
        { field: "buildId", expected: "build-new", actual: "absent" },
      ]),
    );
  });

  it("reports missing-manifest for a staged root without one", () => {
    const dir = stagedRoot(null);
    vi.stubEnv("FOLEYARD_DOCS_ROOT", dir);

    const location = getDocumentationLocation();
    expect(location.matched).toBe(false);
    expect(location.matchState).toBe("missing-manifest");
    expect(location.mismatches).toEqual([
      { field: "manifest", expected: "manifest.json in the docs root", actual: "absent" },
    ]);
  });

  it("reports a development checkout as unversioned, not matched", () => {
    const location = getDocumentationLocation();
    expect(location.matched).toBe(false);
    expect(location.matchState).toBe("unversioned");
    expect(location.manifest).toBeNull();
  });
});
