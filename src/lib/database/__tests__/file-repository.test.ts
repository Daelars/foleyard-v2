import { describe, it, expect, beforeEach } from "vitest";
import { initializeDatabaseSchema } from "../migrations";
import { SqliteAudioFileRepository } from "../file-repository";
import { SqliteBrowseRepository } from "../browse-repository";
import { SqliteTagRepository } from "../tag-repository";
import { SqliteCollectionRepository } from "../collection-repository";
import { SQLITE_MAX_VARIABLES } from "../sql-parameters";
import Database from "better-sqlite3";

function createTestDb() {
  const sqlite = new Database(":memory:");
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  initializeDatabaseSchema(sqlite);
  return sqlite;
}

describe("SqliteAudioFileRepository", () => {
  let sqlite: Database;
  let repo: SqliteAudioFileRepository;

  beforeEach(() => {
    sqlite = createTestDb();
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

  it("getFiles filters by tagId", () => {
    const record = {
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
    };

    repo.upsertFile(record);
    repo.upsertFile({ ...record, path: "/music/b.mp3", filename: "b.mp3" });

    const tagRepo = new SqliteTagRepository(
      (repo as unknown as { sqlite: Database }).sqlite,
    );
    const tagId = tagRepo.createTag("impact");
    const taggedId = repo
      .getFiles()
      .find((file) => file.filename === "a.mp3")!.id;
    tagRepo.attachTagToFile(taggedId, tagId);

    const filtered = repo.getFiles({ tagId });
    expect(filtered.map((file) => file.filename)).toEqual(["a.mp3"]);
    expect(repo.getFiles()).toHaveLength(2);
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

  function insertAudioFile(overrides: Record<string, unknown>) {
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
      ...overrides,
    } as Parameters<typeof repo.upsertFile>[0]);
  }

  it("search treats % as a literal character", () => {
    insertAudioFile({ path: "/music/50%.mp3", filename: "50%.mp3" });
    insertAudioFile({ path: "/music/5000.mp3", filename: "5000.mp3" });
    insertAudioFile({ path: "/music/50x.mp3", filename: "50x.mp3" });

    const results = repo.getFiles({ query: "50%" });
    expect(results.map((file) => file.filename)).toEqual(["50%.mp3"]);
  });

  it("search treats _ as a literal character", () => {
    insertAudioFile({ path: "/music/a_b.mp3", filename: "a_b.mp3" });
    insertAudioFile({ path: "/music/aXb.mp3", filename: "aXb.mp3" });

    const results = repo.getFiles({ query: "a_b" });
    expect(results.map((file) => file.filename)).toEqual(["a_b.mp3"]);
  });

  it("search treats backslash as a literal character", () => {
    insertAudioFile({ path: "/music/a\\b.mp3", filename: "a\\b.mp3" });
    insertAudioFile({ path: "/music/aXb.mp3", filename: "aXb.mp3" });

    const results = repo.getFiles({ query: "a\\b" });
    expect(results.map((file) => file.filename)).toEqual(["a\\b.mp3"]);
  });

  it("getFileCount matches getFiles for libraryRoot/directory/tagId/atLibraryRoot filters", () => {
    insertAudioFile({ path: "/root-a/rock/anthem.mp3", filename: "anthem.mp3", libraryRoot: "/root-a", directory: "/root-a/rock" });
    insertAudioFile({ path: "/root-a/rock/ballad.mp3", filename: "ballad.mp3", libraryRoot: "/root-a", directory: "/root-a/rock" });
    insertAudioFile({ path: "/root-a/top.mp3", filename: "top.mp3", libraryRoot: "/root-a", directory: null });
    insertAudioFile({ path: "/root-b/jazz/standard.mp3", filename: "standard.mp3", libraryRoot: "/root-b", directory: "/root-b/jazz" });

    const tagRepo = new SqliteTagRepository(sqlite);
    const tagId = tagRepo.createTag("punchy");
    const anthemId = repo.getFiles().find((file) => file.filename === "anthem.mp3")!.id;
    tagRepo.attachTagToFile(anthemId, tagId);

    const queries = [
      { libraryRoot: "/root-a" },
      { libraryRoot: "/root-a", atLibraryRoot: true },
      { directory: "/root-a/rock" },
      { libraryRoot: "/root-a", directory: "/root-a/rock" },
      { tagId },
      { libraryRoot: "/root-a", tagId },
      { query: "anthem" },
      { favorites: false },
    ] as const;

    for (const options of queries) {
      expect(repo.getFileCount(options), JSON.stringify(options)).toBe(
        repo.getFiles({ ...options, limit: 5000 }).length,
      );
    }
  });

  it("getFileCount matches getFiles for collection + tag filters", () => {
    insertAudioFile({ path: "/music/a.mp3", filename: "a.mp3" });
    insertAudioFile({ path: "/music/b.mp3", filename: "b.mp3" });

    const tagRepo = new SqliteTagRepository(sqlite);
    const collectionRepo = new SqliteCollectionRepository(sqlite);
    const tagId = tagRepo.createTag("riser");
    const collectionId = collectionRepo.createCollection("favorites");
    const files = repo.getFiles();
    for (const file of files) {
      collectionRepo.attachFileToCollection(file.id, collectionId);
    }
    tagRepo.attachTagToFile(files[0].id, tagId);

    const options = { collectionId, tagId };
    expect(repo.getFileCount(options)).toBe(repo.getFiles({ ...options, limit: 5000 }).length);
    expect(repo.getFileCount(options)).toBe(1);
    expect(repo.getFileCount({ collectionId })).toBe(2);
  });

  it("getTagsForFiles handles more ids than the SQLite variable limit", () => {
    const tagRepo = new SqliteTagRepository(sqlite);
    const tagId = tagRepo.createTag("whoosh");
    const total = SQLITE_MAX_VARIABLES + 10;
    const records = Array.from({ length: total }, (_, index) => ({
      path: `/music/file-${index}.mp3`,
      filename: `file-${index}.mp3`,
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
    }));
    repo.batchUpsertFiles(records, new Date().toISOString());

    const files = repo.getFiles({ limit: total + 10 });
    expect(files).toHaveLength(total);
    for (const file of files) {
      tagRepo.attachTagToFile(file.id, tagId);
    }

    const map = tagRepo.getTagsForFiles(files.map((file) => file.id));
    expect(map.size).toBe(total);
    for (const file of files) {
      expect(map.get(file.id)?.map((tag) => tag.name)).toEqual(["whoosh"]);
    }
  });

  it("browse repository returns distinct directories without duplicates", () => {
    insertAudioFile({ path: "/music/rock/a.mp3", filename: "a.mp3", libraryRoot: "/music", directory: "/music/rock" });
    insertAudioFile({ path: "/music/rock/b.mp3", filename: "b.mp3", libraryRoot: "/music", directory: "/music/rock" });
    insertAudioFile({ path: "/music/jazz/c.mp3", filename: "c.mp3", libraryRoot: "/music", directory: "/music/jazz" });

    const browseRepo = new SqliteBrowseRepository(sqlite);
    expect(browseRepo.getUniqueDirectories()).toEqual(["/music/jazz", "/music/rock"]);
    expect(browseRepo.getDirectoriesForRoot("/music")).toEqual(["/music/jazz", "/music/rock"]);
  });

  it("getFiles orders by duration server-side with stable paging", () => {
    insertAudioFile({ path: "/music/c.mp3", filename: "c.mp3", duration: 30 });
    insertAudioFile({ path: "/music/a.mp3", filename: "a.mp3", duration: 5 });
    insertAudioFile({ path: "/music/b.mp3", filename: "b.mp3", duration: null });
    insertAudioFile({ path: "/music/d.mp3", filename: "d.mp3", duration: 10 });

    const ascending = repo.getFiles({ sortKey: "duration", sortDir: "asc" });
    expect(ascending.map((file) => file.filename)).toEqual([
      "a.mp3",
      "d.mp3",
      "c.mp3",
      "b.mp3",
    ]);

    // Paged reads continue the global order instead of reshuffling per page.
    const pageOne = repo.getFiles({ sortKey: "duration", sortDir: "asc", limit: 2, offset: 0 });
    const pageTwo = repo.getFiles({ sortKey: "duration", sortDir: "asc", limit: 2, offset: 2 });
    expect([...pageOne, ...pageTwo].map((file) => file.filename)).toEqual(
      ascending.map((file) => file.filename),
    );

    const descending = repo.getFiles({ sortKey: "duration", sortDir: "desc" });
    expect(descending.map((file) => file.filename)).toEqual([
      "b.mp3",
      "c.mp3",
      "d.mp3",
      "a.mp3",
    ]);
  });

  it("getFiles orders by filename in either direction", () => {
    insertAudioFile({ path: "/music/b.mp3", filename: "b.mp3" });
    insertAudioFile({ path: "/music/a.mp3", filename: "a.mp3" });

    expect(repo.getFiles().map((file) => file.filename)).toEqual(["a.mp3", "b.mp3"]);
    expect(
      repo.getFiles({ sortKey: "filename", sortDir: "desc" }).map((file) => file.filename),
    ).toEqual(["b.mp3", "a.mp3"]);
  });

  it("collection listings honor the server-side sort", () => {
    insertAudioFile({ path: "/music/c.mp3", filename: "c.mp3", duration: 30 });
    insertAudioFile({ path: "/music/a.mp3", filename: "a.mp3", duration: 5 });
    insertAudioFile({ path: "/music/nodur.mp3", filename: "nodur.mp3", duration: null });

    const collectionRepo = new SqliteCollectionRepository(sqlite);
    const collectionId = collectionRepo.createCollection("evening");
    for (const file of repo.getFiles()) {
      collectionRepo.attachFileToCollection(file.id, collectionId);
    }

    const ordered = repo.getFiles({ collectionId, sortKey: "duration", sortDir: "asc" });
    expect(ordered.map((file) => file.filename)).toEqual(["a.mp3", "c.mp3", "nodur.mp3"]);
  });

  it("collection-membership lookups are index-served", () => {
    const indexes = sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'file_collections'")
      .all() as Array<{ name: string }>;
    const names = indexes.map((index) => index.name);
    expect(names).toContain("idx_file_collections_collection_id");
  });
});
