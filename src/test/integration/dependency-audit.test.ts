import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

// Area: dependency audit gate (#260). The gate decides whether a newly
// disclosed advisory fails the build, so the classification it uses is the
// contract: a shipped (production) advisory is gated, a development-only or
// unreachable one never is, and an exception only approves an advisory it
// names while it is unexpired.

const cjsRequire = createRequire(import.meta.url);

interface Advisory {
  id: number;
  url: string;
  title: string;
  severity: string;
  vulnerable_versions: string;
}

interface Finding {
  key: string;
  package: string;
  version: string;
  bucket: string;
  advisory: string;
  severity: string;
  title: string;
  approved: boolean;
  owner: string | null;
  expires: string | null;
}

interface BucketSummary {
  packages: number;
  findings: number;
  gated: number;
  approved: number;
  severity: Record<string, number>;
}

interface GateResult {
  ok: boolean;
  summary: Record<string, BucketSummary>;
  findings: Finding[];
  notApplicable: Finding[];
  warnings: string[];
  violations: string[];
}

interface Lock {
  packages: Map<string, { key: string; name: string; version: string }>;
  root: { dependencies: string[]; devDependencies: string[] };
}

interface Exception {
  package: string;
  advisory: string;
  owner: string;
  reason: string;
  expires: string;
}

interface Auditor {
  parseJsonc(text: string): unknown;
  parseBunLock(text: string): Lock;
  resolveKey(packages: Lock["packages"], parentKey: string, name: string): string | null;
  compareVersions(left: string, right: string): number | null;
  satisfiesRange(version: string, range: string): boolean;
  platformAllows(values: string, target: string): boolean;
  classifyPackages(
    lock: Lock,
    runtime: string[],
    platform: { os: string; cpu: string },
  ): { buckets: Record<string, Set<string>>; bucketByKey: Map<string, string> };
  collectFindings(
    audit: Record<string, Advisory[]>,
    lock: Lock,
    classification: { bucketByKey: Map<string, string> },
  ): { findings: Finding[]; notApplicable: Finding[] };
  validateExceptions(
    exceptions: unknown[],
    findings: Finding[],
    today: string,
  ): { errors: string[]; warnings: string[]; approved: Map<string, unknown> };
  validateConfig(config: unknown): string[];
  evaluateGate(input: {
    audit: Record<string, Advisory[]>;
    lock: Lock;
    config: unknown;
    today: string;
  }): GateResult;
  formatReport(result: GateResult): string;
}

const gate = cjsRequire("../../../scripts/check-dependency-audit.cjs") as Auditor;

const TODAY = "2026-10-15";

function advisory(overrides: Partial<Advisory> = {}): Advisory {
  return {
    id: 1,
    url: "https://github.com/advisories/GHSA-aaaa-bbbb-cccc",
    title: "synthetic advisory",
    severity: "high",
    vulnerable_versions: "<1.0.0",
    ...overrides,
  };
}

function exception(overrides: Partial<Exception> = {}): Exception {
  return {
    package: "app-dep",
    advisory: "GHSA-aaaa-bbbb-cccc",
    owner: "@foleyard/maintainers",
    reason: "no fixed release exists yet",
    expires: "2026-12-31",
    ...overrides,
  };
}

// A lockfile shaped like bun.lock: trailing commas, nested resolutions
// (`parent/child`), a platform-restricted native binary, an unreferenced
// entry, and a runtime package that is installed as a development dependency.
const FIXTURE_LOCK = `
{
  "lockfileVersion": 1,
  "workspaces": {
    "": {
      "name": "fixture",
      "dependencies": {
        "app-dep": "1.0.0",
      },
      "devDependencies": {
        "dev-dep": "1.0.0",
        "electron": "9.9.9",
      },
    },
    "packages/first-party": {
      "name": "first-party",
      "version": "0.1.0",
    },
  },
  "packages": {
    "app-dep": ["app-dep@1.0.0", "", { "dependencies": { "shared": "2.0.0", "native-linux": "1.0.0", "native-win": "1.0.0" } }, "sha512-aaa"],
    "shared": ["shared@2.0.0", "", {}, "sha512-bbb"],
    "dev-dep": ["dev-dep@1.0.0", "", { "dependencies": { "dev-shared": "1.0.0", "shared": "1.0.0" } }, "sha512-ccc"],
    "dev-dep/shared": ["shared@1.0.0", "", {}, "sha512-jjj"],
    "dev-shared": ["dev-shared@1.0.0", "", {}, "sha512-ddd"],
    "native-linux": ["native-linux@1.0.0", "", { "os": [ "linux" ], "cpu": [ "x64" ] }, "sha512-eee"],
    "native-win": ["native-win@1.0.0", "", { "os": [ "win32" ], "cpu": [ "x64" ] }, "sha512-fff"],
    "electron": ["electron@9.9.9", "", { "dependencies": { "installer-only": "1.0.0" } }, "sha512-ggg"],
    "installer-only": ["installer-only@1.0.0", "", {}, "sha512-hhh"],
    "orphan": ["orphan@1.0.0", "", {}, "sha512-iii"],
    "first-party": ["first-party@workspace:packages/first-party", "", {}],
  },
}
`;

const PLATFORM = { os: "win32", cpu: "x64" };

function fixtureLock(): Lock {
  return gate.parseBunLock(FIXTURE_LOCK);
}

function evaluate(
  audit: Record<string, Advisory[]>,
  options: { config?: unknown; today?: string } = {},
): GateResult {
  return gate.evaluateGate({
    audit,
    lock: fixtureLock(),
    config: options.config ?? { runtimeDependencies: ["electron"], shippedPlatform: PLATFORM, exceptions: [] },
    today: options.today ?? TODAY,
  });
}

describe("dependency audit gate", () => {
  it("reads a bun.lock with trailing commas, nested copies and local links", () => {
    const lock = fixtureLock();
    expect([...lock.packages.keys()]).not.toContain("first-party");
    expect(lock.packages.get("app-dep")).toMatchObject({ name: "app-dep", version: "1.0.0" });
    expect(lock.root.dependencies).toEqual(["app-dep"]);
    expect(lock.root.devDependencies).toEqual(["dev-dep", "electron"]);
    // A nested copy is resolved through the parent's resolution path.
    expect(gate.resolveKey(lock.packages, "dev-dep", "shared")).toBe("dev-dep/shared");
    expect(gate.resolveKey(lock.packages, "", "shared")).toBe("shared");
    expect(gate.resolveKey(lock.packages, "app-dep", "missing")).toBeNull();
    expect(gate.parseJsonc('{ "a": [1, 2,], }')).toEqual({ a: [1, 2] });
  });

  it("classifies production, development and unreachable locked packages", () => {
    const { buckets } = gate.classifyPackages(fixtureLock(), ["electron"], PLATFORM);
    expect([...buckets.production].sort()).toEqual([
      "app-dep",
      "electron",
      "native-win",
      "shared",
    ]);
    expect([...buckets.development].sort()).toEqual([
      "dev-dep",
      "dev-dep/shared",
      "dev-shared",
      "installer-only",
    ]);
    // Locked for another operating system, or reachable from nothing at all.
    expect([...buckets.unreachable].sort()).toEqual(["native-linux", "orphan"]);
    // The Electron runtime ships, its install-time dependencies do not.
    expect(buckets.production.has("installer-only")).toBe(false);
  });

  it("matches the version ranges the advisory feed uses", () => {
    for (const [version, range, expected] of [
      ["0.5.18", "<0.6.0", true],
      ["0.6.1", "<0.6.0", false],
      ["4.1.1", ">=4.0.0 <5.0.9", true],
      ["5.0.9", ">=4.0.0 <5.0.9", false],
      ["7.29.0", "<=7.29.0", true],
      ["7.29.1", "<=7.29.0", false],
      ["1.15.2", "=1.15.2", true],
      ["1.15.3", "=1.15.2", false],
      ["16.2.6", ">=16.0.0 <16.2.11", true],
      ["16.2.11", ">=16.0.0 <16.2.11", false],
      ["1.26.0-dev.20260416", "<1.26.0", true],
      ["1.26.0", "<1.26.0", false],
      ["3.0.0", ">=1.0.0 <2.0.0 || >=3.0.0", true],
    ] as Array<[string, string, boolean]>) {
      expect(gate.satisfiesRange(version, range), `${version} ${range}`).toBe(expected);
    }
    // An unparseable range is gated, never waved through.
    expect(gate.satisfiesRange("1.2.3", "^1.2.0")).toBe(true);
    expect(gate.compareVersions("1.2.3", "1.2.3")).toBe(0);
    expect(gate.compareVersions("1.10.0", "1.9.0")).toBe(1);
  });

  it("blames only the locked copies an advisory actually affects", () => {
    const lock = fixtureLock();
    const classification = gate.classifyPackages(lock, ["electron"], PLATFORM);
    const { findings, notApplicable } = gate.collectFindings(
      {
        // The feed is keyed by package name: one advisory, two copies, only the
        // 1.0.0 one vulnerable. The shipped 2.0.0 copy must not be blamed.
        shared: [advisory({ vulnerable_versions: "<2.0.0" })],
        "dev-shared": [advisory({ vulnerable_versions: "<0.0.1" })],
      },
      lock,
      classification,
    );
    expect(findings).toEqual([
      expect.objectContaining({
        package: "shared",
        version: "1.0.0",
        key: "dev-dep/shared",
        bucket: "development",
      }),
    ]);
    expect(notApplicable).toEqual([
      expect.objectContaining({ package: "dev-shared", advisory: "GHSA-aaaa-bbbb-cccc" }),
    ]);
  });

  it("fails on an unapproved high or critical production advisory, and passes once approved", () => {
    const audit = {
      "app-dep": [
        advisory({ severity: "critical", vulnerable_versions: "<9.0.0", title: "remote code execution" }),
      ],
    };
    const failed = evaluate(audit);
    expect(failed.ok).toBe(false);
    expect(failed.violations).toEqual([
      "unapproved critical production advisory: app-dep@1.0.0 GHSA-aaaa-bbbb-cccc — remote code execution",
    ]);
    expect(failed.summary.production).toMatchObject({ packages: 4, findings: 1, gated: 1, approved: 0 });

    const approved = evaluate(audit, {
      config: {
        runtimeDependencies: ["electron"],
        shippedPlatform: PLATFORM,
        exceptions: [exception({ package: "app-dep", advisory: "GHSA-aaaa-bbbb-cccc" })],
      },
    });
    expect(approved.violations).toEqual([]);
    expect(approved.ok).toBe(true);
    expect(approved.summary.production.approved).toBe(1);
    expect(approved.findings[0]).toMatchObject({ approved: true, owner: "@foleyard/maintainers" });
  });

  it("never gates development-only or unreachable findings, however severe", () => {
    const result = evaluate({
      "dev-shared": [advisory({ severity: "critical", vulnerable_versions: "<9.0.0" })],
      "native-linux": [advisory({ severity: "critical", vulnerable_versions: "<9.0.0" })],
      orphan: [advisory({ severity: "high", vulnerable_versions: "<9.0.0" })],
    });
    expect(result.ok).toBe(true);
    expect(result.violations).toEqual([]);
    expect(result.summary.development).toMatchObject({ findings: 1, gated: 1 });
    expect(result.summary.unreachable).toMatchObject({ findings: 2, gated: 2 });
    expect(result.summary.production).toMatchObject({ findings: 0, gated: 0 });
  });

  it("reports a production finding below the gate instead of failing it", () => {
    const result = evaluate({
      "app-dep": [advisory({ severity: "moderate", vulnerable_versions: "<9.0.0" })],
    });
    expect(result.ok).toBe(true);
    expect(result.summary.production).toMatchObject({ findings: 1, gated: 0 });
  });

  it("requires every exception to carry an owner, a reason and a future expiry", () => {
    const findings = evaluate({
      "app-dep": [advisory({ severity: "high", vulnerable_versions: "<9.0.0" })],
    }).findings;
    const base = { runtimeDependencies: [], shippedPlatform: PLATFORM };

    for (const field of ["owner", "reason", "expires"] as const) {
      const broken = { ...exception(), [field]: "" };
      const result = evaluate(
        { "app-dep": [advisory({ severity: "high", vulnerable_versions: "<9.0.0" })] },
        { config: { ...base, exceptions: [broken] } },
      );
      expect(result.ok, `missing ${field} must fail`).toBe(false);
      expect(result.violations.join("\n")).toContain(field);
    }

    const expired = gate.validateExceptions(
      [exception({ expires: "2026-10-14" })],
      findings,
      TODAY,
    );
    expect(expired.errors).toEqual([
      "exception #1 (app-dep GHSA-aaaa-bbbb-cccc) expired on 2026-10-14; re-review it, then fix or renew",
    ]);
    expect(expired.approved.size).toBe(0);

    const badDate = gate.validateExceptions([exception({ expires: "2026-13-01" })], findings, TODAY);
    expect(badDate.errors.join()).toContain("YYYY-MM-DD");

    const unknownKey = gate.validateExceptions(
      [{ ...exception(), ticket: "#260" }],
      findings,
      TODAY,
    );
    expect(unknownKey.errors.join()).toContain("unknown key");

    // A valid exception still approves.
    const valid = gate.validateExceptions([exception()], findings, TODAY);
    expect(valid.errors).toEqual([]);
    expect(valid.warnings).toEqual([]);
    expect(valid.approved.size).toBe(1);
  });

  it("warns when an exception has outlived the advisory it approved", () => {
    const stale = gate.validateExceptions([exception({ package: "ghost" })], [], TODAY);
    expect(stale.errors).toEqual([]);
    expect(stale.warnings[0]).toContain("matches no current advisory");
  });

  it("rejects a configuration it cannot interpret", () => {
    expect(gate.validateConfig(null)).toEqual(["dependency-audit.json must be a JSON object"]);
    expect(gate.validateConfig({ typo: true }).join()).toContain('unknown key "typo"');
    expect(gate.validateConfig({ runtimeDependencies: "electron" }).join()).toContain(
      "must be an array of package names",
    );
    expect(gate.validateConfig({ shippedPlatform: { os: "win32" } }).join()).toContain(
      "needs a non-empty cpu",
    );
    const result = evaluate({}, { config: { exceptions: {}, runtimeDependencies: [] } });
    expect(result.ok).toBe(false);
  });

  it("distinguishes all three buckets in its report", () => {
    const report = gate.formatReport(
      evaluate({
        "app-dep": [advisory({ severity: "moderate", vulnerable_versions: "<9.0.0" })],
        "dev-shared": [advisory({ severity: "critical", vulnerable_versions: "<9.0.0" })],
        "native-linux": [advisory({ severity: "high", vulnerable_versions: "<9.0.0" })],
      }),
    );
    expect(report).toMatch(/production\s+4 packages\s+1 findings \(moderate 1\)/);
    expect(report).toMatch(/development\s+4 packages\s+1 findings \(critical 1\)/);
    expect(report).toMatch(/unreachable\s+2 packages\s+1 findings \(high 1\)/);
    expect(report).toContain("OK — no unapproved high or critical production advisory");

    const failing = gate.formatReport(
      evaluate({ "app-dep": [advisory({ severity: "high", vulnerable_versions: "<9.0.0" })] }),
    );
    expect(failing).toContain("FAILED with 1 problem(s):");
    expect(failing).toContain("unapproved high production advisory: app-dep@1.0.0");
  });

  it("holds the repository's own dependencies to the shipped classification", () => {
    const root = path.resolve(__dirname, "..", "..", "..");
    const lock = gate.parseBunLock(fs.readFileSync(path.join(root, "bun.lock"), "utf8"));
    const config = JSON.parse(fs.readFileSync(path.join(root, "dependency-audit.json"), "utf8")) as {
      runtimeDependencies: string[];
      shippedPlatform: { os: string; cpu: string };
    };
    const { bucketByKey } = gate.classifyPackages(
      lock,
      config.runtimeDependencies,
      config.shippedPlatform,
    );
    const bucketOf = (key: string) => bucketByKey.get(key);

    // What ships: the Next.js runtime, the metadata reader, the Electron
    // runtime, the traced native modules and the updater.
    for (const shipped of ["next", "next/postcss", "music-metadata", "electron", "better-sqlite3", "sharp", "adm-zip"]) {
      expect(bucketOf(shipped), `${shipped} ships`).toBe("production");
    }
    // What does not: test, lint and packaging tooling, and the shadcn CLI the
    // build only reads for its Tailwind CSS layer.
    for (const development of ["vitest", "eslint", "electron-builder", "shadcn", "esbuild", "tsx"]) {
      expect(bucketOf(development), `${development} is development-only`).toBe("development");
    }
    // Locked for platforms the desktop build does not ship.
    for (const otherPlatform of ["@esbuild/linux-x64", "tsx/esbuild/@esbuild/darwin-arm64"]) {
      expect(bucketOf(otherPlatform), `${otherPlatform} is unreachable`).toBe("unreachable");
    }

    // With no advisories the gate passes on the real tree.
    const clean = gate.evaluateGate({ audit: {}, lock, config, today: TODAY });
    expect(clean.ok).toBe(true);
    expect(clean.summary.production.packages).toBeGreaterThan(150);
    expect(clean.summary.development.packages).toBeGreaterThan(clean.summary.production.packages);
  });
});
