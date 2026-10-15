import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

// Area: #306. The manifest and the staged documentation must describe one
// verified system. Staging starts from a clean output and the check runs on
// that output only (docs:prepare -> docs:check is the only supported order);
// a stale file, a stale/extra manifest entry or a missing entry fails instead
// of passing silently. The registry itself validates status, audience, paths,
// duplicates and the required current documents.

const REPO_ROOT = process.cwd();
const PREPARE = "scripts/prepare-docs.cjs";
const CHECK = "scripts/check-docs.cjs";
const SPAWN_TIMEOUT = 30_000;

type RunResult = { status: number; stdout: string; stderr: string };

const created: string[] = [];

function tempDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  created.push(dir);
  return dir;
}

function run(
  script: string,
  args: string[],
  env: Record<string, string> = {},
): RunResult {
  try {
    const stdout = execFileSync(process.execPath, [script, ...args], {
      cwd: REPO_ROOT,
      encoding: "utf8",
      env: { ...process.env, ...env },
      stdio: "pipe",
    });
    return { status: 0, stdout, stderr: "" };
  } catch (error) {
    const failure = error as {
      status?: number | null;
      stdout?: string;
      stderr?: string;
    };
    return {
      status: typeof failure.status === "number" ? failure.status : 1,
      stdout: failure.stdout ?? "",
      stderr: failure.stderr ?? String(error),
    };
  }
}

type ManifestEntry = {
  id: string;
  path: string;
  title?: string;
  status?: string;
  audience?: string;
};

type Manifest = {
  manifestId?: string;
  stagedAt?: string;
  documents: ManifestEntry[];
};

function readJson(file: string): Manifest {
  return JSON.parse(fs.readFileSync(file, "utf8")) as Manifest;
}

function writeJson(file: string, value: unknown): void {
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
}

/** Run the check against an alternate registry the caller mutates. */
function checkAgainstRegistry(mutate: (manifest: Manifest) => void): RunResult {
  const manifest = readJson(path.join(REPO_ROOT, "docs", "manifest.json"));
  mutate(manifest);
  const registryPath = path.join(tempDir("foleyard-registry-"), "manifest.json");
  writeJson(registryPath, manifest);
  return run(CHECK, ["--dir", tempDir("foleyard-registry-stage-")], {
    FOLEYARD_DOCS_MANIFEST: registryPath,
  });
}

afterEach(() => {
  for (const dir of created.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe("documentation staging and manifest validation (#306)", () => {
  it(
    "stages from a clean output and passes the check",
    () => {
      const outDir = tempDir("foleyard-clean-");
      fs.mkdirSync(path.join(outDir, "docs"), { recursive: true });
      fs.writeFileSync(path.join(outDir, "docs", "stale.md"), "# stale\n");
      fs.writeFileSync(path.join(outDir, "junk.txt"), "junk\n");

      const prepare = run(PREPARE, ["--out", outDir]);
      expect(prepare.status, prepare.stderr).toBe(0);
      expect(
        fs.existsSync(path.join(outDir, "docs", "stale.md")),
        "staging must clear files left by an earlier run",
      ).toBe(false);
      expect(fs.existsSync(path.join(outDir, "junk.txt"))).toBe(false);

      const check = run(CHECK, ["--dir", outDir]);
      expect(check.status, check.stderr).toBe(0);
      expect(check.stdout).toMatch(/staged set matches docs\/manifest\.json/);
    },
    SPAWN_TIMEOUT,
  );

  it(
    "rejects a stale file in the staged output instead of passing silently",
    () => {
      const outDir = tempDir("foleyard-stale-");
      expect(run(PREPARE, ["--out", outDir]).status).toBe(0);
      fs.writeFileSync(path.join(outDir, "docs", "stale.md"), "# stale\n");

      const check = run(CHECK, ["--dir", outDir]);
      expect(check.status, "a dirty output must not pass").not.toBe(0);
      expect(check.stderr).toContain("stale file in staged output");
      expect(check.stderr).toContain("docs/stale.md");
    },
    SPAWN_TIMEOUT,
  );

  it(
    "rejects a missing registry entry in the staged manifest",
    () => {
      const outDir = tempDir("foleyard-missing-entry-");
      expect(run(PREPARE, ["--out", outDir]).status).toBe(0);
      const manifest = readJson(path.join(outDir, "manifest.json"));
      const removed = manifest.documents.splice(2, 1)[0].id;
      writeJson(path.join(outDir, "manifest.json"), manifest);

      const check = run(CHECK, ["--dir", outDir]);
      expect(check.status).not.toBe(0);
      expect(check.stderr).toContain(`staged manifest is missing registry id "${removed}"`);
    },
    SPAWN_TIMEOUT,
  );

  it(
    "rejects a staged file that is missing from disk",
    () => {
      const outDir = tempDir("foleyard-missing-file-");
      expect(run(PREPARE, ["--out", outDir]).status).toBe(0);
      fs.rmSync(path.join(outDir, "docs", "search.md"));

      const check = run(CHECK, ["--dir", outDir]);
      expect(check.status).not.toBe(0);
      expect(check.stderr).toContain("staged file missing: docs/search.md");
    },
    SPAWN_TIMEOUT,
  );

  it(
    "rejects a duplicate id in the staged manifest",
    () => {
      const outDir = tempDir("foleyard-dup-");
      expect(run(PREPARE, ["--out", outDir]).status).toBe(0);
      const manifest = readJson(path.join(outDir, "manifest.json"));
      manifest.documents.push({ ...manifest.documents[0] });
      writeJson(path.join(outDir, "manifest.json"), manifest);

      const check = run(CHECK, ["--dir", outDir]);
      expect(check.status, "a collapsed duplicate must not pass silently").not.toBe(0);
      expect(check.stderr).toContain("duplicate id");
    },
    SPAWN_TIMEOUT,
  );

  it(
    "enforces the docs:prepare -> docs:check order",
    () => {
      const outDir = tempDir("foleyard-order-");
      expect(run(PREPARE, ["--out", outDir]).status).toBe(0);
      const manifest = readJson(path.join(outDir, "manifest.json"));
      delete manifest.stagedAt;
      writeJson(path.join(outDir, "manifest.json"), manifest);

      const check = run(CHECK, ["--dir", outDir]);
      expect(check.status, "a manifest not produced by staging must fail").not.toBe(0);
      expect(check.stderr).toContain("docs:prepare");

      const missing = run(CHECK, ["--dir", tempDir("foleyard-empty-")]);
      expect(missing.status).not.toBe(0);
      expect(missing.stderr).toContain("docs:prepare");
    },
    SPAWN_TIMEOUT,
  );

  it(
    "validates status, audience, paths, duplicates and required current documents",
    () => {
      const badStatus = checkAgainstRegistry((m) => {
        m.documents[0].status = "obsolete";
      });
      expect(badStatus.status).not.toBe(0);
      expect(badStatus.stderr).toContain("invalid status");

      const badAudience = checkAgainstRegistry((m) => {
        m.documents[0].audience = "aliens";
      });
      expect(badAudience.status).not.toBe(0);
      expect(badAudience.stderr).toContain("invalid audience");

      const missingAudience = checkAgainstRegistry((m) => {
        delete m.documents[0].audience;
      });
      expect(missingAudience.status).not.toBe(0);
      expect(missingAudience.stderr).toContain("invalid audience");

      const unsafePath = checkAgainstRegistry((m) => {
        m.documents[0].path = "../package.json";
      });
      expect(unsafePath.status).not.toBe(0);
      expect(unsafePath.stderr).toContain("unsafe path");

      const duplicateId = checkAgainstRegistry((m) => {
        m.documents.push({ ...m.documents[0] });
      });
      expect(duplicateId.status).not.toBe(0);
      expect(duplicateId.stderr).toContain("duplicate manifest id");

      const duplicatePath = checkAgainstRegistry((m) => {
        m.documents[1].path = m.documents[0].path;
      });
      expect(duplicatePath.status).not.toBe(0);
      expect(duplicatePath.stderr).toContain("duplicate manifest path");

      const missingIndex = checkAgainstRegistry((m) => {
        m.documents = m.documents.filter((doc) => doc.id !== "index");
      });
      expect(missingIndex.status).not.toBe(0);
      expect(missingIndex.stderr).toContain('required current document "index"');

      const demotedIndex = checkAgainstRegistry((m) => {
        m.documents.find((doc) => doc.id === "index")!.status = "historical";
      });
      expect(demotedIndex.status).not.toBe(0);
      expect(demotedIndex.stderr).toContain('required current document "index"');
    },
    60_000,
  );
});
