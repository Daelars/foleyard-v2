import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { DOCUMENT_REGISTRY } from "@/lib/documentation";

// Area: extension v2 R10 (#173). Repository contracts: the shipped docs
// manifest, the staging scripts, and the packaged build contents agree.
// New v2 guides are registered and staged; the handoff prompt and
// historical audits stay out of the manifest; production builds keep
// fixtures and the workbench out while keeping v2 code and docs in.

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

function registryIdsFromScript(scriptPath: string): string[] {
  const source = readFileSync(join(root, scriptPath), "utf8");
  const ids: string[] = [];
  for (const match of source.matchAll(/\{\s*id:\s*"([^"]+)",\s*relativePath:/g)) {
    ids.push(match[1] as string);
  }
  return ids;
}

describe("v2 documentation and build contracts", () => {
  it("registers the four v2 guides in the real manifest", () => {
    const ids = DOCUMENT_REGISTRY.map((entry) => entry.id);
    for (const id of [
      "extensions-v2",
      "extensions-v2-migration",
      "extensions-v2-make-pack",
      "extensions-v2-troubleshooting",
    ]) {
      expect(ids).toContain(id);
    }
    for (const entry of DOCUMENT_REGISTRY) {
      expect(existsSync(join(root, entry.relativePath)), `missing ${entry.id}`).toBe(true);
    }
  });

  it("keeps the manifest, staging scripts, and checks on the same document list", () => {
    const registry = DOCUMENT_REGISTRY.map((entry) => entry.id);
    expect(registryIdsFromScript("scripts/prepare-docs.cjs")).toEqual(registry);
    expect(registryIdsFromScript("scripts/check-docs.cjs")).toEqual(registry);
  });

  it("never registers the handoff prompt or historical audits as shipped docs", () => {
    for (const entry of DOCUMENT_REGISTRY) {
      expect(entry.relativePath.startsWith("docs/plans/")).toBe(false);
      expect(entry.relativePath.startsWith("docs/audits/")).toBe(false);
      expect(entry.relativePath.startsWith("docs/audit-2026-09/")).toBe(false);
    }
    const ids = DOCUMENT_REGISTRY.map((entry) => entry.id);
    expect(ids).not.toContain("extension-v2-implementation-prompt");
  });

  it("stages and verifies the full manifest including the v2 guides", () => {
    const dir = mkdtempSync(join(tmpdir(), "v2-docs-"));
    try {
      execFileSync("node", [join(root, "scripts", "prepare-docs.cjs"), "--out", dir], {
        cwd: root,
        stdio: "pipe",
      });
      execFileSync("node", [join(root, "scripts", "check-docs.cjs"), "--dir", dir], {
        cwd: root,
        stdio: "pipe",
      });
      const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8")) as {
        manifestId: string;
        productVersion: string;
        documents: Array<{ id: string; relativePath: string }>;
      };
      expect(manifest.manifestId).toBe("foleyard-docs");
      expect(manifest.productVersion).toBe(
        (JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { version: string }).version,
      );
      for (const id of ["extensions-v2", "extensions-v2-migration", "extensions-v2-make-pack", "extensions-v2-troubleshooting"]) {
        expect(manifest.documents.some((doc) => doc.id === id)).toBe(true);
      }
      const staged = readFileSync(join(dir, "docs", "extensions-v2.md"), "utf8");
      expect(staged.length).toBeGreaterThan(500);
      // Staged reads resolve every new guide; nothing is a stub.
      for (const name of [
        "extensions-v2.md",
        "extensions-v2-migration.md",
        "extensions-v2-make-pack.md",
        "extensions-v2-troubleshooting.md",
      ]) {
        expect(readFileSync(join(dir, "docs", name), "utf8").length).toBeGreaterThan(500);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("keeps v2 code in production builds and fixtures out of them", () => {
    // Workspace inclusion: the v2 reference package resolves for CI and builds.
    const rootPackage = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
      workspaces: string[];
    };
    expect(rootPackage.workspaces).toContain("packages/yard-tools/*");
    const makePack = JSON.parse(
      readFileSync(join(root, "packages", "yard-tools", "make-pack-v2", "package.json"), "utf8"),
    ) as { private: boolean; dependencies: Record<string, string> };
    expect(makePack.private).toBe(true);
    expect(Object.keys(makePack.dependencies)).toEqual(["yard-core"]);
    // Production exclusion: prototype routes never ship, and the staging
    // output itself is never committed.
    const builder = readFileSync(join(root, "electron-builder.yml"), "utf8");
    expect(builder).toContain("!.next/server/app/prototype/**");
    expect(builder).toContain("staged-docs/foleyard-docs");
    expect(
      readFileSync(join(root, "src", "app", "prototype", "layout.tsx"), "utf8"),
    ).toContain("notFound()");
    expect(readFileSync(join(root, ".gitignore"), "utf8")).toContain("/staged-docs/");
    // The workbench stays dev-only and out of coverage-gated builds.
    expect(readdirSync(join(root, "src", "app", "prototype"))).toContain("ext-v2-workbench");
  });

  it("passes the v2 dependency boundary scan", () => {
    execFileSync("node", [join(root, "scripts", "check-v2-boundaries.cjs")], {
      cwd: root,
      stdio: "pipe",
    });
  });
});
