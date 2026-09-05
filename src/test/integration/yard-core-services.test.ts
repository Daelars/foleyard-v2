import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { normalizeDirectoryPath } from "@yard-core";
import {
  audioFileRecord,
  createTestDatabase,
  type TestDatabase,
} from "@/test/fixtures";
import { SqliteAudioFileRepository } from "@/lib/database/file-repository";
import { SqliteTagRepository } from "@/lib/database/tag-repository";
import { SqliteCollectionRepository } from "@/lib/database/collection-repository";
import { SqliteSettingsRepository } from "@/lib/database/settings-repository";
import { saveLibraryRoot } from "@/lib/scanner/run-scan";

// Area: yard-core service layer (#130). The service contracts in yard-core
// are interfaces; these tests pin the documented behavior of the contract
// methods the area tickets exercise only in passing, against the SQLite
// repositories that implement them.

const state = vi.hoisted(() => ({
  files: null as SqliteAudioFileRepository | null,
  tags: null as SqliteTagRepository | null,
  collections: null as SqliteCollectionRepository | null,
  settings: null as SqliteSettingsRepository | null,
}));

vi.mock("@/lib/db", () => ({
  getFiles: (...args: never[]) => state.files!.getFiles(...args),
  getFileCount: (...args: never[]) => state.files!.getFileCount(...args),
  getAllFilesIncludingRemoved: () => state.files!.getAllFilesIncludingRemoved(),
  getFileById: (id: string) => state.files!.getFileById(id),
  getFileByPath: (path: string) => state.files!.getFileByPath(path),
  getFilesByPaths: (paths: string[]) => state.files!.getFilesByPaths(paths),
  upsertFile: (record: never) => state.files!.upsertFile(record),
  batchTouchFiles: (entries: never, now: string) => state.files!.batchTouchFiles(entries, now),
  batchUpsertFiles: (records: never, now: string) => state.files!.batchUpsertFiles(records, now),
  batchUpdateFileMetadata: (records: never, now: string) =>
    state.files!.batchUpdateFileMetadata(records, now),
  batchMarkRemoved: (paths: string[], removedAt: string, now: string) =>
    state.files!.batchMarkRemoved(paths, removedAt, now),
  reconcileMovedFiles: () => state.files!.reconcileMovedFiles(),
  toggleFavorite: (id: string) => state.files!.toggleFavorite(id),
  getLibraryRoot: () => state.settings!.getLibraryRoot(),
  getLibraryRoots: () => state.settings!.getLibraryRoots(),
  getLibraryStats: () => state.settings!.getLibraryStats(),
  setLibraryRoots: (roots: string[]) => state.settings!.setLibraryRoots(roots),
}));

let sqlite: TestDatabase;
let files: SqliteAudioFileRepository;
let collections: SqliteCollectionRepository;
let settings: SqliteSettingsRepository;

const NOW = () => new Date().toISOString();

beforeEach(() => {
  sqlite = createTestDatabase();
  files = new SqliteAudioFileRepository(sqlite);
  state.files = files;
  state.tags = new SqliteTagRepository(sqlite);
  state.collections = new SqliteCollectionRepository(sqlite);
  collections = state.collections;
  settings = new SqliteSettingsRepository(sqlite);
  state.settings = settings;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  sqlite.close();
  vi.restoreAllMocks();
});

describe("yard-core service contracts", () => {
  it("keeps one library root behind the singular and plural keys together", () => {
    settings.setLibraryRoot("/lib");
    expect(settings.getLibraryRoot()).toBe("/lib");
    expect(settings.getLibraryRoots()).toEqual(["/lib"]);

    // The scan entrypoint saves through the same key.
    saveLibraryRoot("/music");
    expect(settings.getLibraryRoot()).toBe("/music");
    expect(settings.getLibraryRoots()).toEqual(["/music"]);
  });

  it("runs the collection lifecycle: filter, count, detach and delete", () => {
    files.batchUpsertFiles(
      [
        audioFileRecord({ path: "/lib/kick.wav", filename: "kick.wav" }),
        audioFileRecord({ path: "/lib/snare.wav", filename: "snare.wav" }),
      ],
      NOW(),
    );
    const [kick, snare] = files.getFiles({ limit: 10 });

    const smartId = collections.createSmartCollection("Kicks", JSON.stringify({ q: "kick" }));
    expect(collections.getSmartCollectionCount(smartId)).toBe(1);
    expect(collections.getSmartCollectionCount("missing")).toBeNull();

    collections.updateCollectionFilter(smartId, JSON.stringify({ q: "snare" }));
    expect(collections.getSmartCollectionCount(smartId)).toBe(1);
    expect(files.getFileCount({ collectionId: smartId })).toBe(0);

    const regularId = collections.createCollection("Session");
    collections.attachFileToCollection(kick.id, regularId);
    collections.attachFileToCollection(snare.id, regularId);
    expect(files.getFileCount({ collectionId: regularId })).toBe(2);
    collections.detachFileFromCollection(snare.id, regularId);
    expect(files.getFileCount({ collectionId: regularId })).toBe(1);

    // Deleting the collection removes the memberships with it.
    collections.deleteCollection(regularId);
    expect(collections.getAllCollections().some((c) => c.id === regularId)).toBe(false);
    expect(files.getFileCount({ collectionId: regularId })).toBe(0);
    expect(files.getFileById(kick.id)?.removedAt).toBeNull();
  });

  it("touches seen files and normalises separators for the browse path", () => {
    files.batchUpsertFiles(
      [audioFileRecord({ path: "/lib/kick.wav", filename: "kick.wav" })],
      NOW(),
    );
    const before = files.getFileByPath("/lib/kick.wav")!.lastScannedAt;
    files.touchFileAsSeen("/lib/kick.wav", "2030-01-01T00:00:00.000Z");
    expect(files.getFileByPath("/lib/kick.wav")?.lastScannedAt).toBe("2030-01-01T00:00:00.000Z");
    expect(before).not.toBe("2030-01-01T00:00:00.000Z");

    expect(normalizeDirectoryPath("foley\\wood\\hits")).toBe("foley/wood/hits");
    expect(normalizeDirectoryPath("foley/wood")).toBe("foley/wood");
  });
});
