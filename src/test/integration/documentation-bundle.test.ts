import { describe, expect, it } from "vitest";
import Database from "better-sqlite3";

import { readDocumentation, listDocumentIds, DOCUMENT_REGISTRY } from "@/lib/documentation";
import { initializeDatabaseSchema, getDatabaseVersionInfo, CURRENT_SCHEMA_VERSION } from "@/lib/database/migrations";
import { getServerRuntimeSnapshot } from "@/lib/runtime-info";

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

  it("registry paths exist for live documents", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    for (const entry of DOCUMENT_REGISTRY) {
      const abs = path.resolve(process.cwd(), entry.relativePath);
      expect(fs.existsSync(abs), `missing ${entry.id} -> ${entry.relativePath}`).toBe(true);
    }
  });

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
