import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";

import {
  V2_EXTENSION_API_VERSION,
  YARD_EXTENSION_API_VERSION,
  type ExtensionV2Definition,
} from "@yard-core";

// Area: extension v2 R10 (#173). Runtime discovery reports v1/v2
// identity, actual registration and enablement, API standing,
// capabilities, contributions, commands, events, and settings schema
// refs. Reads are side-effect free: no handler runs, and the database
// file is opened read-only only when it already exists.

vi.mock("@/lib/db", () => ({
  getLibraryRoots: () => [],
}));

import {
  getServerRuntimeSnapshot,
  readRuntimeDatabaseFlags,
} from "@/lib/runtime-info";
import {
  getV2Registry,
  unregisterV2Extension,
} from "@/lib/extensions-v2/host";

const PROBE_ID = "discovery-probe";
let handlerCalls = 0;

function probeDefinition(): ExtensionV2Definition {
  return {
    id: PROBE_ID,
    name: "Discovery Probe",
    version: "0.0.0",
    apiVersion: V2_EXTENSION_API_VERSION,
    description: "Proves introspection never executes handlers.",
    permissions: ["library:read"],
    commands: [
      {
        id: `${PROBE_ID}.detonate`,
        title: "Detonate",
        description: "Throws when executed; the snapshot must never call it.",
        scope: "global",
        result: { kind: "string" },
      },
    ],
    settings: [
      {
        id: `${PROBE_ID}.mode`,
        label: "Mode",
        description: "Probe setting schema; values never leave the store.",
        type: "string",
        defaultValue: "quiet",
      },
    ],
    contributions: [
      { id: `${PROBE_ID}.palette`, type: "command-palette", commandId: `${PROBE_ID}.detonate` },
    ],
    docsRefs: [{ id: "extensions-v2", title: "Extension authoring (v2 API)" }],
  };
}

afterEach(() => {
  try {
    unregisterV2Extension(PROBE_ID);
  } catch {
    // absence is explicit, not fatal
  }
  handlerCalls = 0;
});

function seedTempDatabase(dir: string): string {
  const dbPath = join(dir, "probe.sqlite");
  const handle = new Database(dbPath);
  handle.exec("CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT, updatedAt TEXT)");
  const insert = handle.prepare("INSERT INTO settings (key, value, updatedAt) VALUES (?, ?, ?)");
  insert.run("extension:sound-shelf:enabled", "true", "2026-09-06T00:00:00.000Z");
  insert.run(
    "v2:approvals",
    JSON.stringify({ approvals: [{ extensionId: "make-pack-v2", permissions: ["library:read"], grantedAt: "2026-09-06T00:00:00.000Z" }] }),
    "2026-09-06T00:00:00.000Z",
  );
  handle.close();
  return dbPath;
}

describe("v2 runtime discovery", () => {
  it("reports v1 and v2 systems with API identity and real registration", () => {
    const snapshot = getServerRuntimeSnapshot();
    expect(snapshot.schemaVersion).toBe(1);
    expect(snapshot.extensionSystems).toEqual([
      {
        system: "v1",
        apiVersion: YARD_EXTENSION_API_VERSION,
        standing: "internal",
        registered: expect.arrayContaining(["sound-shelf", "make-pack"]),
      },
      {
        system: "v2",
        apiVersion: V2_EXTENSION_API_VERSION,
        standing: "internal",
        registered: expect.arrayContaining([
          "make-pack-v2",
          "sound-shelf-v2",
          "smart-collections-v2",
          "folder-janitor-v2",
          "library-gatherer-v2",
          "drop-rules-v2",
        ]),
      },
    ]);
    const makePack = snapshot.extensionsV2.find((entry) => entry.id === "make-pack-v2");
    expect(makePack).toMatchObject({
      name: "Make Pack v2",
      registered: true,
      apiVersion: 2,
      standing: "internal",
      source: "bundled",
    });
    expect(makePack!.commandIds).toEqual([
      "make-pack-v2.from-selection",
      "make-pack-v2.from-shelf",
      "make-pack-v2.from-recent",
    ]);
    expect(makePack!.contributions).toHaveLength(7);
    expect(makePack!.settings.map((setting) => setting.id)).toEqual([
      "make-pack-v2.pack-name",
      "make-pack-v2.default-format",
      "make-pack-v2.include-manifest",
    ]);
    // Settings travel as schema (ids, types, defaults); values never leave the store.
    expect(makePack!.settings.every((setting) => "defaultValue" in setting)).toBe(true);
    // Effective permissions stay inside the declared set.
    const declared = new Set(makePack!.declaredPermissions);
    for (const permission of makePack!.effectivePermissions) {
      expect(declared.has(permission)).toBe(true);
    }
    expect(typeof makePack!.enabled).toBe("boolean");
    expect(typeof makePack!.approvalsKnown).toBe("boolean");
  });

  it("lists the host-owned v2 event contracts", () => {
    const snapshot = getServerRuntimeSnapshot();
    expect(snapshot.eventsV2.map((event) => event.type).sort()).toEqual([
      "approvals-changed",
      "contributions-changed",
      "job-transition",
      "settings-changed",
      "state-changed",
    ]);
    for (const event of snapshot.eventsV2) {
      expect(event.owner).toBe("host");
      expect(event.docsId).toBe("events");
    }
  });

  it("never executes handlers while describing them", async () => {
    const { getAppV2Host } = await import("@/lib/extensions-v2/host");
    getV2Registry().register(probeDefinition());
    getAppV2Host().registerHandler(PROBE_ID, `${PROBE_ID}.detonate`, () => {
      handlerCalls += 1;
      throw new Error("handler must not run during introspection");
    });
    const snapshot = getServerRuntimeSnapshot();
    expect(handlerCalls).toBe(0);
    const probe = snapshot.extensionsV2.find((entry) => entry.id === PROBE_ID);
    expect(probe?.commandIds).toEqual([`${PROBE_ID}.detonate`]);
    expect(handlerCalls).toBe(0);
  });

  it("exports no sensitive payloads from either system", () => {
    const snapshot = getServerRuntimeSnapshot();
    const json = JSON.stringify(snapshot);
    expect(json).not.toMatch(/grantToken/i);
    expect(json).not.toMatch(/BEGIN PRIVATE/i);
    expect(json).not.toMatch(/\.sqlite-wal/i);
    expect(json).not.toMatch(/stack/i);
    // Catalogs stay data: a JSON round-trip neither drops nor invents keys.
    expect(JSON.parse(json).extensionsV2).toHaveLength(snapshot.extensionsV2.length);
  });

  it("reads flags through a read-only handle only when the file exists", () => {
    const dir = mkdtempSync(join(tmpdir(), "v2-discovery-"));
    try {
      const missing = join(dir, "absent.sqlite");
      const absent = readRuntimeDatabaseFlags(missing);
      expect(absent.filePresent).toBe(false);
      expect(absent.v1Enabled.size).toBe(0);
      expect(absent.approvals).toBeNull();
      // The read must not create the file.
      const after = readdirSync(dir);
      expect(after).not.toContain("absent.sqlite");

      const dbPath = seedTempDatabase(dir);
      const present = readRuntimeDatabaseFlags(dbPath);
      expect(present.filePresent).toBe(true);
      expect(present.v1Enabled.get("sound-shelf")).toBe(true);
      expect(present.approvals?.grantedPermissions("make-pack-v2")).toEqual(["library:read"]);
      // Read-only proof: no WAL, SHM, or journal sidecars appear beside the file.
      const sidecars = readdirSync(dir).filter((name) => name !== "probe.sqlite");
      expect(sidecars).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("degrades to unknown approvals on a corrupt row instead of throwing", () => {
    const dir = mkdtempSync(join(tmpdir(), "v2-discovery-"));
    try {
      const dbPath = join(dir, "corrupt.sqlite");
      const handle = new Database(dbPath);
      handle.exec("CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT, updatedAt TEXT)");
      handle.prepare("INSERT INTO settings (key, value, updatedAt) VALUES (?, ?, ?)").run(
        "v2:approvals",
        "{not-json",
        "2026-09-06T00:00:00.000Z",
      );
      handle.close();
      const flags = readRuntimeDatabaseFlags(dbPath);
      expect(flags.filePresent).toBe(true);
      expect(flags.approvals).toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
