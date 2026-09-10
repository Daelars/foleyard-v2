import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { callRoute } from "@/test/fixtures";
import type { TestDatabase } from "@/test/fixtures";
import { createTestDatabase } from "@/test/fixtures";
import { SqliteAudioFileRepository } from "@/lib/database/file-repository";
import { SqliteCollectionRepository } from "@/lib/database/collection-repository";
import { SqliteSettingsRepository } from "@/lib/database/settings-repository";

const stateRows = new Map<string, unknown>();

vi.mock("@/lib/extensions-v2/settings-state", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/extensions-v2/settings-state")>();
  return {
    ...original,
    readV2SettingsRow: (key: string) => stateRows.get(key),
    writeV2SettingsRow: (key: string, value: unknown) => stateRows.set(key, value),
    deleteV2SettingsRow: (key: string) => {
      stateRows.delete(key);
    },
    listV2SettingsKeys: (prefix: string) => [...stateRows.keys()].filter((key) => key.startsWith(prefix)),
  };
});

const state = vi.hoisted(() => ({
  files: null as SqliteAudioFileRepository | null,
  collections: null as SqliteCollectionRepository | null,
  settings: null as SqliteSettingsRepository | null,
}));

vi.mock("@/lib/db", () => ({
  getFiles: (...args: never[]) => state.files!.getFiles(...args),
  getFileById: (id: string) => state.files!.getFileById(id),
  getFilesByIds: (ids: string[]) => state.files!.getFilesByIds(ids),
  getLibraryRoots: () => state.settings!.getLibraryRoots(),
  createSmartCollection: (name: string, filter: string) => state.collections!.createSmartCollection(name, filter),
  getAllCollections: () => state.collections!.getAllCollections(),
  batchMarkRemoved: () => {},
  batchUpsertFiles: () => {},
}));

import { POST } from "@/app/api/extensions-v2/execute/route";
import { getV2Registry, setV2ExtensionEnabled } from "@/lib/extensions-v2/host";
import { revokeV2Approval, setV2Approval } from "@/lib/extensions-v2/policy";

const SMART_V2 = "smart-collections-v2";

// Area: Smart Collections v1 retirement. save-search now executes through
// the v2 route: the same stored filter shape on the shared collections
// table, input validation before the write, and the v2 enabled/approval
// gates.
describe("Smart Collections v2 route", () => {
  let sqlite: TestDatabase;

  beforeEach(() => {
    sqlite = createTestDatabase();
    state.files = new SqliteAudioFileRepository(sqlite);
    state.collections = new SqliteCollectionRepository(sqlite);
    state.settings = new SqliteSettingsRepository(sqlite);
    stateRows.clear();
    setV2ExtensionEnabled(SMART_V2, true);
    setV2Approval(SMART_V2, getV2Registry().get(SMART_V2)!.permissions);
  });

  afterEach(() => {
    sqlite.close();
    revokeV2Approval(SMART_V2);
    setV2ExtensionEnabled(SMART_V2, false);
  });

  it("creates a smart collection through the shared table", async () => {
    const response = await callRoute(POST, {
      url: "http://localhost/api/extensions-v2/execute",
      body: {
        extensionId: SMART_V2,
        commandId: "smart-collections-v2.save-search",
        input: { name: "Kicks", query: "kick" },
      },
    });
    expect(response.status).toBe(200);
    const created = state.collections!.getAllCollections().find(
      (collection) => collection.name === "Kicks",
    );
    expect(created?.isSmart).toBeTruthy();
    expect(created?.filter).toBe(JSON.stringify({ q: "kick" }));
  });

  it("rejects a blank name before the write", async () => {
    const response = await callRoute(POST, {
      url: "http://localhost/api/extensions-v2/execute",
      body: {
        extensionId: SMART_V2,
        commandId: "smart-collections-v2.save-search",
        input: { name: "", query: "kick" },
      },
    });
    expect(response.status).toBe(400);
    expect(state.collections!.getAllCollections()).toHaveLength(0);
  });

  it("denies without approval", async () => {
    setV2ExtensionEnabled(SMART_V2, false);
    const response = await callRoute(POST, {
      url: "http://localhost/api/extensions-v2/execute",
      body: {
        extensionId: SMART_V2,
        commandId: "smart-collections-v2.save-search",
        input: { name: "Kicks", query: "kick" },
      },
    });
    expect(response.status).toBe(403);
  });
});