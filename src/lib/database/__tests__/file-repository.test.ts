import { describe, it, expect, beforeEach } from "vitest";
import { initializeDatabaseSchema } from "../migrations";
import { SqliteAudioFileRepository } from "../file-repository";
import Database from "better-sqlite3";

function createTestDb() {
  const sqlite = new Database(":memory:");
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  initializeDatabaseSchema(sqlite);
  return sqlite;
}

describe("SqliteAudioFileRepository", () => {
  let repo: SqliteAudioFileRepository;

  beforeEach(() => {
    const sqlite = createTestDb();
    repo = new SqliteAudioFileRepository(sqlite);
  });

  it("getFiles returns empty array on fresh database", () => {
    expect(repo.getFiles()).toEqual([]);
  });

  it("upsertFile inserts a record", () => {
    const record = {
      path: "/music/test.mp3",
      filename: "test.mp3",
      directory: "/music",
      format: ".mp3",
      codec: "mp3",
      duration: 120,
      sampleRate: 44100,
      bitDepth: 16,
      channels: 2,
      fileSize: 1000,
      mtimeMs: 1000000,
      removedAt: null,
      lastScannedAt: new Date().toISOString(),
    };

    repo.upsertFile(record);

    const files = repo.getFiles();
    expect(files).toHaveLength(1);
    expect(files[0].filename).toBe("test.mp3");
    expect(files[0].path).toBe("/music/test.mp3");
  });

  it("upsertFile updates existing record on path conflict", () => {
    const record = {
      path: "/music/test.mp3",
      filename: "test.mp3",
      directory: "/music",
      format: ".mp3",
      codec: null,
      duration: 120,
      sampleRate: 44100,
      bitDepth: 16,
      channels: 2,
      fileSize: 1000,
      mtimeMs: 1000000,
      removedAt: null,
      lastScannedAt: new Date().toISOString(),
    };

    repo.upsertFile(record);

    const updated = {
      ...record,
      duration: 200,
      fileSize: 2000,
      lastScannedAt: new Date().toISOString(),
    };

    repo.upsertFile(updated);

    const files = repo.getFiles();
    expect(files).toHaveLength(1);
    expect(files[0].duration).toBe(200);
    expect(files[0].fileSize).toBe(2000);
  });

  it("getFileCount returns correct count", () => {
    repo.upsertFile({
      path: "/music/a.mp3",
      filename: "a.mp3",
      directory: "/music",
      format: ".mp3",
      codec: null,
      duration: null,
      sampleRate: null,
      bitDepth: null,
      channels: null,
      fileSize: null,
      mtimeMs: 0,
      removedAt: null,
      lastScannedAt: "",
    });

    expect(repo.getFileCount()).toBe(1);
  });

  it("getFileCount respects showRemoved option", () => {
    repo.upsertFile({
      path: "/music/a.mp3",
      filename: "a.mp3",
      directory: "/music",
      format: ".mp3",
      codec: null,
      duration: null,
      sampleRate: null,
      bitDepth: null,
      channels: null,
      fileSize: null,
      mtimeMs: 0,
      removedAt: null,
      lastScannedAt: "",
    });

    repo.markFileRemoved("/music/a.mp3", new Date().toISOString());

    expect(repo.getFileCount()).toBe(0);
    expect(repo.getFileCount({ showRemoved: true })).toBe(1);
  });

  it("toggleFavorite toggles the favorite flag", () => {
    repo.upsertFile({
      path: "/music/a.mp3",
      filename: "a.mp3",
      directory: "/music",
      format: ".mp3",
      codec: null,
      duration: null,
      sampleRate: null,
      bitDepth: null,
      channels: null,
      fileSize: null,
      mtimeMs: 0,
      removedAt: null,
      lastScannedAt: "",
    });

    const files = repo.getFiles();
    const id = files[0].id;

    const firstResult = repo.toggleFavorite(id);
    expect(firstResult).toBe(true);

    const favorites = repo.getFiles({ favorites: true });
    expect(favorites).toHaveLength(1);

    const secondResult = repo.toggleFavorite(id);
    expect(secondResult).toBe(true);

    const noFavorites = repo.getFiles({ favorites: true });
    expect(noFavorites).toHaveLength(0);
  });

  it("toggleFavorite returns false for non-existent id", () => {
    expect(repo.toggleFavorite("nonexistent")).toBe(false);
  });

  it("batchTouchFiles updates lastScannedAt and clears removedAt", () => {
    repo.upsertFile({
      path: "/music/a.mp3",
      filename: "a.mp3",
      directory: "/music",
      format: ".mp3",
      codec: null,
      duration: null,
      sampleRate: null,
      bitDepth: null,
      channels: null,
      fileSize: null,
      mtimeMs: 0,
      removedAt: null,
      lastScannedAt: "",
    });
    repo.markFileRemoved("/music/a.mp3", new Date().toISOString());

    const removedFile = repo.getFiles({ showRemoved: true })[0];
    expect(removedFile.removedAt).not.toBeNull();

    const now = new Date().toISOString();
    repo.batchTouchFiles([{ path: "/music/a.mp3", lastScannedAt: now }], now);

    const touched = repo.getFiles()[0];
    expect(touched.removedAt).toBeNull();
  });

  it("getFiles filters by query", () => {
    repo.upsertFile({
      path: "/music/foo.mp3",
      filename: "foo.mp3",
      directory: "/music",
      format: ".mp3",
      codec: null,
      duration: null,
      sampleRate: null,
      bitDepth: null,
      channels: null,
      fileSize: null,
      mtimeMs: 0,
      removedAt: null,
      lastScannedAt: "",
    });
    repo.upsertFile({
      path: "/music/bar.wav",
      filename: "bar.wav",
      directory: "/music",
      format: ".wav",
      codec: null,
      duration: null,
      sampleRate: null,
      bitDepth: null,
      channels: null,
      fileSize: null,
      mtimeMs: 0,
      removedAt: null,
      lastScannedAt: "",
    });

    const results = repo.getFiles({ query: "foo" });
    expect(results).toHaveLength(1);
    expect(results[0].filename).toBe("foo.mp3");
  });

  it("getFilesByPaths returns files matching paths", () => {
    repo.upsertFile({
      path: "/music/a.mp3",
      filename: "a.mp3",
      directory: "/music",
      format: ".mp3",
      codec: null,
      duration: null,
      sampleRate: null,
      bitDepth: null,
      channels: null,
      fileSize: null,
      mtimeMs: 0,
      removedAt: null,
      lastScannedAt: "",
    });
    repo.upsertFile({
      path: "/music/b.wav",
      filename: "b.wav",
      directory: "/music",
      format: ".wav",
      codec: null,
      duration: null,
      sampleRate: null,
      bitDepth: null,
      channels: null,
      fileSize: null,
      mtimeMs: 0,
      removedAt: null,
      lastScannedAt: "",
    });

    const results = repo.getFilesByPaths(["/music/a.mp3", "/nonexistent.mp3"]);
    expect(results).toHaveLength(1);
    expect(results[0].filename).toBe("a.mp3");
  });

  it("getFilesByPaths returns empty for empty input", () => {
    expect(repo.getFilesByPaths([])).toEqual([]);
  });

  it("getAllFilesIncludingRemoved returns removed files", () => {
    repo.upsertFile({
      path: "/music/a.mp3",
      filename: "a.mp3",
      directory: "/music",
      format: ".mp3",
      codec: null,
      duration: null,
      sampleRate: null,
      bitDepth: null,
      channels: null,
      fileSize: null,
      mtimeMs: 0,
      removedAt: null,
      lastScannedAt: "",
    });
    repo.markFileRemoved("/music/a.mp3", new Date().toISOString());

    const all = repo.getAllFilesIncludingRemoved();
    expect(all).toHaveLength(1);
    expect(all[0].removedAt).not.toBeNull();
  });

  it("batchUpsertFiles handles batch operations transactionally", () => {
    const records = [
      {
        path: "/music/1.mp3",
        filename: "1.mp3",
        directory: "/music",
        format: ".mp3",
        codec: null,
        duration: null,
        sampleRate: null,
        bitDepth: null,
        channels: null,
        fileSize: 100,
        mtimeMs: 0,
        removedAt: null,
        lastScannedAt: "",
      },
      {
        path: "/music/2.wav",
        filename: "2.wav",
        directory: "/music",
        format: ".wav",
        codec: null,
        duration: null,
        sampleRate: null,
        bitDepth: null,
        channels: null,
        fileSize: 200,
        mtimeMs: 0,
        removedAt: null,
        lastScannedAt: "",
      },
    ];

    repo.batchUpsertFiles(records, new Date().toISOString());
    expect(repo.getFileCount()).toBe(2);
  });

  it("batchMarkRemoved marks multiple files", () => {
    repo.upsertFile({
      path: "/music/1.mp3",
      filename: "1.mp3",
      directory: "/music",
      format: ".mp3",
      codec: null,
      duration: null,
      sampleRate: null,
      bitDepth: null,
      channels: null,
      fileSize: null,
      mtimeMs: 0,
      removedAt: null,
      lastScannedAt: "",
    });
    repo.upsertFile({
      path: "/music/2.wav",
      filename: "2.wav",
      directory: "/music",
      format: ".wav",
      codec: null,
      duration: null,
      sampleRate: null,
      bitDepth: null,
      channels: null,
      fileSize: null,
      mtimeMs: 0,
      removedAt: null,
      lastScannedAt: "",
    });

    const now = new Date().toISOString();
    repo.batchMarkRemoved(["/music/1.mp3", "/music/2.wav"], now, now);
    expect(repo.getFileCount()).toBe(0);
    expect(repo.getFileCount({ showRemoved: true })).toBe(2);
  });

  it("batchUpdateFileMetadata updates metadata fields", () => {
    repo.upsertFile({
      path: "/music/1.mp3",
      filename: "1.mp3",
      directory: "/music",
      format: ".mp3",
      codec: null,
      duration: null,
      sampleRate: null,
      bitDepth: null,
      channels: null,
      fileSize: null,
      mtimeMs: 0,
      removedAt: null,
      lastScannedAt: "",
    });

    repo.batchUpdateFileMetadata(
      [{ path: "/music/1.mp3", codec: "mp3", duration: 300, sampleRate: 48000, bitDepth: 24, channels: 2, fileSize: 5000 }],
      new Date().toISOString(),
    );

    const files = repo.getFiles();
    expect(files[0].duration).toBe(300);
    expect(files[0].sampleRate).toBe(48000);
  });

  it("getFileById returns null for missing id", () => {
    expect(repo.getFileById("nonexistent")).toBeNull();
  });

  it("getFileByPath returns null for missing path", () => {
    expect(repo.getFileByPath("/nonexistent.mp3")).toBeNull();
  });
});
