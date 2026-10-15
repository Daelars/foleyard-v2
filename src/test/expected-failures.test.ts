import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

// Area: expected-failure accounting (#304).
//
// The ledger used to assert a *count* of pinned expected failures in the
// integration suite. A count cannot say which regression slipped, so a correct
// expected failure could be silently swapped for an unrelated one. These tests
// hold the replacement contract: a structured ledger entry maps one-to-one to
// a pinned test by ID, severity is explicit, data-loss entries are release
// blockers, and any expected failure outside the integration suite is
// reported.
//
// The scanner reads `it.fails(...)` out of every test file, so this file must
// never contain that call outside a string that is itself being scanned —
// hence `FAILS` below builds the call from fragments.

type LedgerEntry = {
  id: string;
  finding: string;
  area: string;
  severity: string;
  owner: string;
  introduced: string;
  reviewBy: string;
  test: string;
};

type PinnedTest = {
  id: string | null;
  title: string;
  file: string;
};

type LedgerModule = {
  LEDGER_PATH: string;
  INTEGRATION_PREFIX: string;
  SEVERITIES: string[];
  RELEASE_BLOCKING_SEVERITIES: string[];
  OWNERS: string[];
  parseLedger(
    markdown: string,
    options?: { today?: string },
  ): { entries: LedgerEntry[]; errors: string[] };
  scanTestSource(
    source: string,
    filePath: string,
  ): { tests: PinnedTest[]; errors: string[] };
  scanRepository(root: string): { tests: PinnedTest[]; errors: string[] };
  loadLedger(
    root: string,
    options?: { today?: string },
  ): { entries: LedgerEntry[]; errors: string[] };
  linkLedger(input: {
    entries: LedgerEntry[];
    tests: PinnedTest[];
  }): { errors: string[] };
  evaluateRepository(
    root: string,
    options?: { today?: string },
  ): {
    entries: LedgerEntry[];
    tests: PinnedTest[];
    errors: string[];
    blockers: LedgerEntry[];
  };
  assertReleaseReady(root: string, options?: { today?: string }): unknown;
};

const cjsRequire = createRequire(import.meta.url);
const ledger = cjsRequire(
  "../../scripts/lib/expected-failures.cjs",
) as LedgerModule;

const repoRoot = path.resolve(__dirname, "..", "..");
const integrationFile = "src/test/integration/database-correctness.test.ts";
const packageFile = "packages/yard-tools/example-v2/src/thing.test.ts";

// "it.f" + "ails" keeps the literal call out of this file's own source, and
// tag() keeps the ledger's bracketed IDs out of it too, so the scanner this
// file exercises does not mistake the fixtures for real pins.
const FAILS = "it.f" + "ails";
const tag = (id: string) => `[${id}]`;

function pinnedSource(title: string): string {
  return `${FAILS}("${title}", () => {});`;
}

function pinnedMultiLineSource(title: string): string {
  return `${FAILS}(\n  "${title}",\n  () => {},\n);`;
}

function isoDaysFromToday(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

const today = isoDaysFromToday(0);
const future = () => isoDaysFromToday(90);
const past = () => isoDaysFromToday(-1);

function entry(overrides: Partial<LedgerEntry> = {}): LedgerEntry {
  return {
    id: "XF-B03-01",
    finding: "B03",
    area: "database-correctness",
    severity: "data-correctness",
    owner: "Application",
    introduced: "0.1.8",
    reviewBy: future(),
    test: integrationFile,
    ...overrides,
  };
}

function ledgerTable(rows: Array<Partial<LedgerEntry>>): string {
  const header =
    "| ID | Finding | Area | Severity | Owner | Introduced | Review by | Test |";
  const separator = "| --- | --- | --- | --- | --- | --- | --- | --- |";
  const body = rows
    .map((row) => {
      const full = entry(row);
      return `| ${full.id} | ${full.finding} | ${full.area} | ${full.severity} | ${full.owner} | ${full.introduced} | ${full.reviewBy} | \`${full.test}\` |`;
    })
    .join("\n");
  return `${header}\n${separator}\n${body}\n`;
}

function runChecker(args: string[]) {
  return spawnSync(
    process.execPath,
    ["scripts/check-expected-failures.cjs", ...args],
    { cwd: repoRoot, encoding: "utf8" },
  );
}

function writeFixture(rows: Array<Partial<LedgerEntry>>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "foleyard-xf-"));
  fs.mkdirSync(path.join(root, "docs"), { recursive: true });
  fs.mkdirSync(path.join(root, "src", "test", "integration"), {
    recursive: true,
  });
  fs.writeFileSync(path.join(root, "docs", "expected-failures.md"), ledgerTable(rows));
  fs.writeFileSync(
    path.join(root, "src", "test", "integration", "database-correctness.test.ts"),
    pinnedSource(`${tag("XF-B03-01")} agrees across filters`),
  );
  return root;
}

describe("expected-failure accounting", () => {
  it("maps every pinned regression to exactly one structured ledger entry", () => {
    const result = ledger.evaluateRepository(repoRoot, { today });

    expect(result.errors).toEqual([]);
    expect(result.entries.length).toBeGreaterThan(0);
    // The old count check, expressed as a mapping: no more, no fewer.
    expect(result.tests.length).toBe(result.entries.length);

    const ids = result.entries.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);

    for (const item of result.entries) {
      expect(item.severity, `${item.id} severity`).toBeTruthy();
      expect(item.owner, `${item.id} owner`).toBeTruthy();
      expect(item.introduced, `${item.id} introduced`).toMatch(/^\d+\.\d+\.\d+$/);
      expect(item.reviewBy, `${item.id} reviewBy`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(ledger.SEVERITIES).toContain(item.severity);
      expect(ledger.OWNERS).toContain(item.owner);
    }
  });

  it("requires a unique id, severity, owner, introduced version and review date on every entry", () => {
    expect(ledger.parseLedger(ledgerTable([{}]), { today }).errors).toEqual([]);

    expect(
      ledger.parseLedger(ledgerTable([{ severity: "" }]), { today }).errors.join("\n"),
    ).toContain("severity");
    expect(
      ledger.parseLedger(ledgerTable([{ owner: "" }]), { today }).errors.join("\n"),
    ).toContain("owner");
    expect(
      ledger.parseLedger(ledgerTable([{ introduced: "" }]), { today }).errors.join("\n"),
    ).toContain("introduced");
    expect(
      ledger.parseLedger(ledgerTable([{ reviewBy: "" }]), { today }).errors.join("\n"),
    ).toContain("review");
    expect(
      ledger.parseLedger(ledgerTable([{ id: "not-an-id" }]), { today }).errors.join("\n"),
    ).toContain("id");
    expect(
      ledger
        .parseLedger(ledgerTable([{ id: "XF-B03-01" }, { id: "XF-B03-01" }]), { today })
        .errors.join("\n"),
    ).toContain("duplicate");

    // A review date that has passed forces a re-review instead of drifting.
    expect(
      ledger
        .parseLedger(ledgerTable([{ reviewBy: past() }]), { today })
        .errors.join("\n"),
    ).toContain("review");
  });

  it("cannot be satisfied by count alone: swapping one pin for another fails", () => {
    const entries = ledger.parseLedger(ledgerTable([{}]), { today }).entries;
    // Same number of pinned failures, but an unrelated regression replaced the
    // one the ledger records. The old count check passed here; this must not.
    const linked = ledger.linkLedger({
      entries,
      tests: [
        {
          id: "XF-B09-99",
          title: `${tag("XF-B09-99")} some other regression`,
          file: integrationFile,
        },
      ],
    });
    expect(linked.errors.join("\n")).toContain("XF-B03-01");
    expect(linked.errors.join("\n")).toContain("XF-B09-99");
  });

  it("detects expected failures outside the integration suite", () => {
    const scanned = ledger.scanTestSource(
      pinnedSource(`${tag("XF-B03-01")} a regression that drifted into a package`),
      packageFile,
    );
    expect(scanned.errors).toEqual([]);
    expect(scanned.tests).toHaveLength(1);

    const linked = ledger.linkLedger({
      entries: [entry({ test: packageFile })],
      tests: scanned.tests,
    });
    expect(linked.errors.join("\n")).toContain("integration");
  });

  it("treats data-loss entries as release blockers under an explicit policy", () => {
    const result = ledger.evaluateRepository(repoRoot, { today });

    expect(ledger.RELEASE_BLOCKING_SEVERITIES).toContain("data-loss");
    expect(ledger.RELEASE_BLOCKING_SEVERITIES).not.toContain("data-correctness");
    expect(ledger.RELEASE_BLOCKING_SEVERITIES).not.toContain("ux");

    expect(result.blockers.length).toBeGreaterThan(0);
    for (const blocker of result.blockers) {
      expect(blocker.severity).toBe("data-loss");
    }

    // The release gate used by prepare-release.cjs and release.yml.
    expect(() => ledger.assertReleaseReady(repoRoot, { today })).toThrow(
      /release blocked/i,
    );
  });

  it("blocks a release only for data-loss entries", () => {
    const allowed = writeFixture([{ severity: "data-correctness" }]);
    const blocking = writeFixture([{ severity: "data-loss" }]);
    try {
      expect(() => ledger.assertReleaseReady(allowed, { today })).not.toThrow();
      expect(() => ledger.assertReleaseReady(blocking, { today })).toThrow(
        /release blocked/i,
      );
    } finally {
      fs.rmSync(allowed, { recursive: true, force: true });
      fs.rmSync(blocking, { recursive: true, force: true });
    }
  });

  it("requires a test and its ledger entry to change together", () => {
    const scanned = ledger.scanTestSource(
      pinnedSource(`${tag("XF-B03-01")} agrees across filters`),
      integrationFile,
    );
    expect(scanned.errors).toEqual([]);
    expect(scanned.tests).toEqual([
      {
        id: "XF-B03-01",
        title: `${tag("XF-B03-01")} agrees across filters`,
        file: integrationFile,
      },
    ]);

    // A pinned test with no ledger entry is unregistered.
    expect(
      ledger.linkLedger({ entries: [], tests: scanned.tests }).errors.join("\n"),
    ).toContain("unregistered");

    // A ledger entry with no pinned test is an orphan.
    expect(
      ledger.linkLedger({ entries: [entry()], tests: [] }).errors.join("\n"),
    ).toContain("no pinned");

    // A ledger entry pointing at the wrong file is a mismatch.
    expect(
      ledger
        .linkLedger({
          entries: [entry({ test: "src/test/integration/other.test.ts" })],
          tests: scanned.tests,
        })
        .errors.join("\n"),
    ).toContain("points at");
  });

  it("rejects a pinned test without an id and a stale id left on a passing test", () => {
    const noId = ledger.scanTestSource(
      pinnedSource("a regression with no ledger id"),
      integrationFile,
    );
    expect(noId.errors.join("\n")).toContain("id");

    const stale = ledger.scanTestSource(
      `it(${JSON.stringify(`${tag("XF-B03-01")} this finding is fixed`)}, () => {});`,
      integrationFile,
    );
    expect(stale.errors.join("\n")).toContain("XF-B03-01");
  });

  it("reads multi-line pinned titles the same way vitest does", () => {
    const scanned = ledger.scanTestSource(
      pinnedMultiLineSource(
        `${tag("XF-B02-01")} keeps recordings from inheriting each other`,
      ),
      "src/test/integration/data-loss-prevention.test.ts",
    );
    expect(scanned.errors).toEqual([]);
    expect(scanned.tests.map((item) => item.id)).toEqual(["XF-B02-01"]);
  });

  it("passes the CI check and blocks a release while data-loss findings are pinned", () => {
    const check = runChecker([]);
    expect(check.status).toBe(0);
    expect(check.stdout).toMatch(/pinned regression/);

    const release = runChecker(["--release"]);
    expect(release.status).toBe(1);
    expect(`${release.stdout}${release.stderr}`).toMatch(/release blocked/i);
  });
});
