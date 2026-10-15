import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

// Area: #310. Generated extension packages and the advertised runnable
// examples must prove themselves in CI. The scaffold output passes the
// same gates CI enforces, and every advertised example is discovered and
// executed from one declaration. The negative cases deliberately break a
// generated package (API drift, a forbidden import) and assert the CI
// check catches it, so a template that slips out of sync with the real
// v2 API fails loudly instead of drifting (#265).

const REPO_ROOT = resolve(__dirname, "..", "..", "..");
const NEXT_DIR = join(REPO_ROOT, ".next");
const SCAFFOLD = join(REPO_ROOT, "scripts", "scaffold-extension-v2.cjs");
const CHECK = join(REPO_ROOT, "scripts", "check-generated-extension.cjs");
const RUN_EXAMPLES = join(REPO_ROOT, "scripts", "run-examples.cjs");

const probes: string[] = [];

function scaffold(name: string): string {
  mkdirSync(NEXT_DIR, { recursive: true });
  const dir = mkdtempSync(join(NEXT_DIR, "gen-ci-"));
  probes.push(dir);
  execFileSync(process.execPath, [SCAFFOLD, "--name", name, "--out", dir, "--force"], {
    cwd: REPO_ROOT,
    stdio: "pipe",
  });
  return dir;
}

function runCheck(dir: string): { failed: boolean; output: string } {
  try {
    const output = execFileSync(process.execPath, [CHECK, "--dir", dir], {
      cwd: REPO_ROOT,
      encoding: "utf8",
      stdio: "pipe",
    });
    return { failed: false, output };
  } catch (error) {
    const captured = error as { stdout?: unknown; stderr?: unknown };
    return {
      failed: true,
      output: `${String(captured.stdout ?? "")}${String(captured.stderr ?? "")}${
        error instanceof Error ? error.message : ""
      }`,
    };
  }
}

afterAll(() => {
  for (const dir of probes) rmSync(dir, { recursive: true, force: true });
});

describe("generated extension packages prove themselves (#310)", () => {
  it("fails the check when a generated handler drifts from the v2 API", () => {
    const dir = scaffold("gen-ci-drift");
    const handlersPath = join(dir, "src", "handlers.ts");
    const original = readFileSync(handlersPath, "utf8");
    const drifted = original.replace(
      "context.operations.settings.get",
      "context.ports.settings.get",
    );
    expect(drifted, "the generated handler must read through context.operations").not.toBe(
      original,
    );
    writeFileSync(handlersPath, drifted);

    const { failed, output } = runCheck(dir);
    expect(failed, "generated API drift must fail the check").toBe(true);
    expect(output).toMatch(/FAILED/);
    expect(output).toMatch(/error TS|typecheck/i);
  }, 300_000);

  it("fails the check when a generated handler crosses a v2 boundary", () => {
    const dir = scaffold("gen-ci-boundary");
    const handlersPath = join(dir, "src", "handlers.ts");
    writeFileSync(
      handlersPath,
      `import fs from "node:fs";\n${readFileSync(handlersPath, "utf8")}`,
    );

    const { failed, output } = runCheck(dir);
    expect(failed, "a forbidden import in a generated package must fail the check").toBe(true);
    expect(output).toMatch(/forbidden import/);
  }, 300_000);

  it("passes typecheck, boundaries and the generated package's own tests", () => {
    const output = execFileSync(process.execPath, [CHECK], {
      cwd: REPO_ROOT,
      encoding: "utf8",
      stdio: "pipe",
    });
    expect(output).toMatch(/generated extension package: OK/);
  }, 600_000);

  it("declares every example once and lists them from that declaration", () => {
    const declaration = JSON.parse(
      readFileSync(join(REPO_ROOT, "examples", "manifest.json"), "utf8"),
    ) as { examples: Array<{ id: string; runtime: string }> };
    const declaredIds = declaration.examples.map((e) => e.id).sort();

    // Discovery: the directory must hold exactly the declared set, so a
    // new example cannot ship undeclared and a declaration cannot point
    // at a missing directory.
    const discovered: string[] = [];
    for (const area of readdirSync(join(REPO_ROOT, "examples"), { withFileTypes: true })) {
      if (!area.isDirectory()) continue;
      const areaDir = join(REPO_ROOT, "examples", area.name);
      for (const example of readdirSync(areaDir, { withFileTypes: true })) {
        if (!example.isDirectory()) continue;
        const dir = join(areaDir, example.name);
        if (!existsSync(join(dir, "run.ts"))) continue;
        expect(existsSync(join(dir, "README.md")), `${area.name}/${example.name}/README.md`).toBe(
          true,
        );
        discovered.push(`${area.name}/${example.name}`);
      }
    }
    expect(discovered.sort()).toEqual(declaredIds);

    for (const example of declaration.examples) {
      expect(["bun", "node"], `${example.id} runtime`).toContain(example.runtime);
    }
    // The native-SQLite example must advertise the Windows-supported
    // runtime; Bun cannot dlopen better-sqlite3 there.
    const queryLibrary = declaration.examples.find((e) => e.id === "core/query-library");
    expect(queryLibrary?.runtime).toBe("node");
    const queryReadme = readFileSync(
      join(REPO_ROOT, "examples", "core", "query-library", "README.md"),
      "utf8",
    );
    expect(queryReadme).toContain("node examples/core/query-library/run.ts");

    const listed = execFileSync(process.execPath, [RUN_EXAMPLES, "--list"], {
      cwd: REPO_ROOT,
      encoding: "utf8",
    });
    expect(listed.trim().split("\n").map((line) => line.split("\t")[0]).sort()).toEqual(
      declaredIds,
    );
  });

  it("runs examples in CI from the single declaration, not a hardcoded workflow", () => {
    const workflow = readFileSync(join(REPO_ROOT, ".github", "workflows", "check.yml"), "utf8");
    expect(workflow).toContain("node scripts/run-examples.cjs");
    expect(workflow).not.toMatch(/example:v2-minimal|example:v2-settings/);
  });
});
