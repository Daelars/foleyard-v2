import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

// Area: extension v2 R9 (#172). The scaffold command produces a valid
// minimal v2 package: all files exist with the expected shape, a bad
// invocation fails loudly, and the generated output typechecks (scoped
// tsc over the probe directory) and runs (the generated vitest suite
// executes through the real host). The probe lives under `.next/`
// (gitignored build output) and is removed afterwards, so the check
// never leaves tree dirt behind.

const REPO_ROOT = resolve(__dirname, "..", "..", "..");
const SCRIPT = join(REPO_ROOT, "scripts", "scaffold-extension-v2.cjs");
const PROBE_DIR = join(REPO_ROOT, ".next", `v2-scaffold-probe-${process.pid}`);
const TSC = join(REPO_ROOT, "node_modules", "typescript", "bin", "tsc");
const VITEST = join(REPO_ROOT, "node_modules", "vitest", "vitest.mjs");

function scaffold(extra: string[]): string {
  return execFileSync(
    process.execPath,
    [SCRIPT, "--name", "scaffold-probe", "--out", PROBE_DIR, ...extra],
    { cwd: REPO_ROOT, encoding: "utf8" },
  );
}

afterAll(() => {
  rmSync(PROBE_DIR, { recursive: true, force: true });
});

describe("scaffold-extension-v2 command", () => {
  it("rejects missing names, malformed slugs, and occupied outputs", () => {
    expect(() =>
      execFileSync(process.execPath, [SCRIPT], { cwd: REPO_ROOT, stdio: "pipe" }),
    ).toThrow();
    expect(() =>
      execFileSync(process.execPath, [SCRIPT, "--name", "Bad Name!"], {
        cwd: REPO_ROOT,
        stdio: "pipe",
      }),
    ).toThrow();
    scaffold(["--force"]);
    expect(() =>
      execFileSync(
        process.execPath,
        [SCRIPT, "--name", "scaffold-probe", "--out", PROBE_DIR],
        { cwd: REPO_ROOT, stdio: "pipe" },
      ),
    ).toThrow(/already exists/);
  });

  it("writes a complete minimal package with static-registration docs", () => {
    scaffold(["--force"]);
    for (const relative of [
      "package.json",
      "src/definition.ts",
      "src/handlers.ts",
      "src/index.ts",
      "src/handlers.test.ts",
      "README.md",
    ]) {
      expect(existsSync(join(PROBE_DIR, relative)), relative).toBe(true);
    }
    const manifest = JSON.parse(readFileSync(join(PROBE_DIR, "package.json"), "utf8")) as {
      private?: boolean;
      dependencies?: Record<string, string>;
    };
    expect(manifest.private).toBe(true);
    expect(manifest.dependencies?.["yard-core"]).toBe("workspace:*");
    const definition = readFileSync(join(PROBE_DIR, "src/definition.ts"), "utf8");
    expect(definition).toContain("V2_EXTENSION_API_VERSION");
    expect(definition).toContain("scaffold-probe.describe");
    const readme = readFileSync(join(PROBE_DIR, "README.md"), "utf8");
    expect(readme).toContain("registerScaffoldProbeHandlers");
    expect(readme).toContain("registerV2Extension");
    expect(readme.toLowerCase()).toMatch(/no\s+installer/);
  });

  it("generates output that typechecks", () => {
    scaffold(["--force"]);
    // Explicit absolute config (no `extends` path semantics): the probe
    // resolves `yard-core` exactly like the repo tsconfig does.
    const config = {
      compilerOptions: {
        target: "ES2017",
        lib: ["dom", "dom.iterable", "esnext"],
        allowJs: true,
        skipLibCheck: true,
        strict: true,
        noEmit: true,
        esModuleInterop: true,
        module: "esnext",
        moduleResolution: "bundler",
        resolveJsonModule: true,
        isolatedModules: true,
        jsx: "react-jsx",
        incremental: false,
        baseUrl: REPO_ROOT,
        paths: { "yard-core": ["./packages/yard-core/src/index.ts"] },
        types: ["node"],
      },
      include: ["src/**/*.ts"],
      exclude: [] as string[],
    };
    const configPath = join(PROBE_DIR, "tsconfig.probe.json");
    writeFileSync(configPath, JSON.stringify(config));
    try {
      execFileSync(process.execPath, [TSC, "--noEmit", "-p", configPath], {
        cwd: REPO_ROOT,
        encoding: "utf8",
        stdio: "pipe",
      });
    } catch (error) {
      const detail =
        error instanceof Error
          ? (error as { stdout?: unknown; stderr?: unknown }).stdout ??
            (error as { stderr?: unknown }).stderr ??
            error.message
          : String(error);
      expect.unreachable(`probe typecheck failed:\n${String(detail)}`);
    }
  }, 300000);

  it("generates output whose test suite runs green", () => {
    scaffold(["--force"]);
    const output = execFileSync(
      process.execPath,
      [VITEST, "run", join(PROBE_DIR, "src", "handlers.test.ts"), "--no-coverage"],
      { cwd: REPO_ROOT, encoding: "utf8" },
    );
    expect(output).toMatch(/3 passed/);
  }, 300000);
});
