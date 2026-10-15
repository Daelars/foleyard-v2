import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { audioFileRecord, callRoute, createTestDatabase, type TestDatabase } from "@/test/fixtures";
import { SqliteAudioFileRepository } from "@/lib/database/file-repository";
import { SqliteBrowseRepository } from "@/lib/database/browse-repository";
import { SqliteCollectionRepository } from "@/lib/database/collection-repository";
import { SqliteLibraryRootService } from "@/lib/database/root-detachment";
import { SqliteSettingsRepository } from "@/lib/database/settings-repository";
import { SqliteTagRepository } from "@/lib/database/tag-repository";

// Area: Library root detachment (#271). Removing a root is a soft operation:
// the root's indexed files are marked detached (excluded from every Library
// read) while their rows and organization data survive for a later re-add.
// This drives the real settings route and the real repository contract, then
// asserts every affected Library read agrees on the same ownership policy.

const ROOT_A = "/library-a";
const ROOT_B = "/library-b";

const state = vi.hoisted(() => ({
  files: null as SqliteAudioFileRepository | null,
  settings: null as SqliteSettingsRepository | null,
  roots: null as SqliteLibraryRootService | null,
  tags: null as SqliteTagRepository | null,
  collections: null as SqliteCollectionRepository | null,
  browse: null as SqliteBrowseRepository | null,
}));

vi.mock("@/lib/db", () => ({
  getFiles: (options?: Record<string, unknown>) => state.files!.getFiles(options),
  getFileCount: (options?: Record<string, unknown>) => state.files!.getFileCount(options),
  getFilesByIds: (ids: string[]) => state.files!.getFilesByIds(ids),
  getOwnedFilesByIds: (ids: string[]) => state.files!.getOwnedFilesByIds(ids),
  getFileById: (id: string) => state.files!.getFileById(id),
  getOwnedFileById: (id: string) => state.files!.getOwnedFileById(id),
  getSubdirectoriesForRoot: (root: string, parent: string | null) =>
    state.browse!.getSubdirectoriesForRoot(root, parent),
  getUniqueDirectories: () => state.browse!.getUniqueDirectories(),
  getAllCollections: (options?: { includeSmartCounts?: boolean }) =>
    state.collections!.getAllCollections(options),
  getSmartCollectionCount: (id: string) => state.collections!.getSmartCollectionCount(id),
  attachFileToCollection: (fileId: string, collectionId: string) =>
    state.collections!.attachFileToCollection(fileId, collectionId),
  detachFileFromCollection: (fileId: string, collectionId: string) =>
    state.collections!.detachFileFromCollection(fileId, collectionId),
  collectionNameExists: (name: string, exceptId?: string) =>
    state.collections!.collectionNameExists(name, exceptId),
  createCollection: (name: string, isSmart?: boolean, filter?: string) =>
    state.collections!.createCollection(name, isSmart, filter),
  deleteCollection: (id: string) => state.collections!.deleteCollection(id),
  renameCollection: (id: string, name: string) => state.collections!.renameCollection(id, name),
  updateCollectionColor: (id: string, color: string | null) =>
    state.collections!.updateCollectionColor(id, color),
  updateCollectionFilter: (id: string, filter: string) =>
    state.collections!.updateCollectionFilter(id, filter),
  convertToRegularCollection: (id: string) => state.collections!.convertToRegularCollection(id),
  getTagsForFile: (id: string) => state.tags!.getTagsForFile(id),
  getTagsForFiles: (ids: string[]) => state.tags!.getTagsForFiles(ids),
  getAttachmentsForFiles: (ids: string[]) => state.tags!.getAttachmentsForFiles(ids),
  getAllTags: () => state.tags!.getAllTags(),
  attachTagToFile: (fileId: string, tagId: string) => state.tags!.attachTagToFile(fileId, tagId),
  detachTagFromFile: (fileId: string, tagId: string) => state.tags!.detachTagFromFile(fileId, tagId),
  createTag: (name: string) => state.tags!.createTag(name),
  deleteTag: (id: string) => state.tags!.deleteTag(id),
  renameTag: (id: string, name: string) => state.tags!.renameTag(id, name),
  updateTagColor: (id: string, color: string | null) => state.tags!.updateTagColor(id, color),
  setFavorites: (ids: string[], value: boolean) => state.files!.setFavorites(ids, value),
  setFileTagBatch: (ids: string[], tagId: string, attached: boolean) =>
    state.files!.setFileTagBatch(ids, tagId, attached),
  toggleFavorite: (id: string) => state.files!.toggleFavorite(id),
  getLibraryRoot: () => state.settings!.getLibraryRoot(),
  getLibraryRoots: () => state.settings!.getLibraryRoots(),
  getLibraryStats: () => state.settings!.getLibraryStats(),
  getOnboardingVersion: () => state.settings!.getOnboardingVersion(),
  setOnboardingVersion: (version: number) => state.settings!.setOnboardingVersion(version),
  detachLibraryRoot: (root: string) => state.roots!.detachRoot(root),
  forgetLibraryRoot: (root: string) => state.roots!.forgetRoot(root),
  reattachLibraryRoot: (root: string) => state.roots!.reattachRoot(root),
  recoverPendingRootChanges: () => state.roots!.recover(),
}));

vi.mock("@/lib/scanner", () => ({
  validateLibraryRoot: vi.fn(async (value: string) => ({
    valid: true,
    normalizedPath: value,
  })),
}));

import { GET as settingsGet, POST as settingsPost } from "@/app/api/settings/route";
import { GET as filesGet } from "@/app/api/files/route";
import { GET as collectionsGet } from "@/app/api/collections/route";
import { GET as directoriesGet } from "@/app/api/directories/route";
import { GET as tagsGet } from "@/app/api/tags/route";
import { GET as audioGet } from "@/app/api/audio/route";
import { GET as waveformGet } from "@/app/api/waveform/route";
import { GET as desktopFileGet } from "@/app/api/desktop/file/route";

type FilesResponse = { files: Array<{ id: string; filename: string; tags?: Array<{ name: string }> }>; favoritesTotal: number };

describe("Library root detachment (#271)", () => {
  let sqlite: TestDatabase;
  let files: SqliteAudioFileRepository;
  let settings: SqliteSettingsRepository;
  let roots: SqliteLibraryRootService;
  let tags: SqliteTagRepository;
  let collections: SqliteCollectionRepository;
  let browse: SqliteBrowseRepository;

  let detachedFile = "";
  let detachedSibling = "";
  let ownedFile = "";
  let tagId = "";
  let collectionId = "";

  function idFor(filename: string) {
    return files.getFiles({ limit: 100, showRemoved: true }).find((row) => row.filename === filename)!.id;
  }

  function rows() {
    return sqlite
      .prepare("SELECT id, path, library_root AS libraryRoot, removed_at AS removedAt, detached_at AS detachedAt FROM files ORDER BY path")
      .all() as Array<{ id: string; path: string; libraryRoot: string | null; removedAt: string | null; detachedAt: string | null }>;
  }

  beforeEach(() => {
    sqlite = createTestDatabase();
    files = new SqliteAudioFileRepository(sqlite);
    settings = new SqliteSettingsRepository(sqlite);
    roots = new SqliteLibraryRootService(sqlite);
    tags = new SqliteTagRepository(sqlite);
    collections = new SqliteCollectionRepository(sqlite);
    browse = new SqliteBrowseRepository(sqlite);
    state.files = files;
    state.settings = settings;
    state.roots = roots;
    state.tags = tags;
    state.collections = collections;
    state.browse = browse;
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const now = new Date().toISOString();
    files.batchUpsertFiles(
      [
        { ...audioFileRecord({ path: `${ROOT_A}/drums/kick.wav`, filename: "kick.wav", directory: "drums" }), libraryRoot: ROOT_A },
        { ...audioFileRecord({ path: `${ROOT_A}/snare.wav`, filename: "snare.wav" }), libraryRoot: ROOT_A },
        { ...audioFileRecord({ path: `${ROOT_B}/pad.wav`, filename: "pad.wav" }), libraryRoot: ROOT_B },
      ],
      now,
    );
    settings.setLibraryRoots([ROOT_A, ROOT_B]);

    detachedFile = idFor("kick.wav");
    detachedSibling = idFor("snare.wav");
    ownedFile = idFor("pad.wav");

    tagId = tags.createTag("drums");
    tags.attachTagToFile(detachedFile, tagId);
    files.setFavorites([detachedFile], true);

    collectionId = collections.createCollection("Kit");
    collections.attachFileToCollection(detachedFile, collectionId);

    sqlite
      .prepare("INSERT INTO file_embeddings (file_id, model, dim, vec) VALUES (?, ?, ?, ?)")
      .run(detachedFile, "clap", 3, Buffer.from([1, 2, 3]));
  });

  afterEach(() => {
    sqlite.close();
    vi.restoreAllMocks();
  });

  it("detaches the removed root's files from every Library read while keeping rows and organization data", async () => {
    const removed = await callRoute(settingsPost, {
      method: "POST",
      body: { action: "remove", path: ROOT_A },
    });
    expect(removed.status).toBe(200);

    // The rows survive, marked detached; the other root is untouched.
    const after = rows();
    expect(after).toHaveLength(3);
    expect(after.find((row) => row.path === `${ROOT_A}/drums/kick.wav`)!.detachedAt).not.toBeNull();
    expect(after.find((row) => row.path === `${ROOT_A}/snare.wav`)!.detachedAt).not.toBeNull();
    expect(after.find((row) => row.path === `${ROOT_B}/pad.wav`)!.detachedAt).toBeNull();

    // Organization data is retained, not deleted.
    expect(sqlite.prepare("SELECT COUNT(*) AS n FROM file_tags WHERE file_id = ?").get(detachedFile)).toEqual({ n: 1 });
    expect(sqlite.prepare("SELECT COUNT(*) AS n FROM file_collections WHERE file_id = ?").get(detachedFile)).toEqual({ n: 1 });
    expect(sqlite.prepare("SELECT COUNT(*) AS n FROM file_embeddings WHERE file_id = ?").get(detachedFile)).toEqual({ n: 1 });

    const list = await callRoute<FilesResponse>(filesGet, { method: "GET", url: "http://localhost/api/files?limit=100" });
    expect(list.status).toBe(200);
    expect(list.body.files.map((file) => file.id)).toEqual([ownedFile]);

    const favorites = await callRoute<FilesResponse>(filesGet, {
      method: "GET",
      url: "http://localhost/api/files?favorites=true&limit=100",
    });
    expect(favorites.body.files).toEqual([]);
    expect(favorites.body.favoritesTotal).toBe(0);

    const hydrated = await callRoute<FilesResponse>(filesGet, {
      method: "GET",
      url: `http://localhost/api/files?ids=${detachedFile},${detachedSibling},${ownedFile}`,
    });
    expect(hydrated.body.files.map((file) => file.id)).toEqual([ownedFile]);

    const byRoot = await callRoute<FilesResponse>(filesGet, {
      method: "GET",
      url: `http://localhost/api/files?libraryRoot=${encodeURIComponent(ROOT_A)}&limit=100`,
    });
    expect(byRoot.body.files).toEqual([]);

    const search = await callRoute<FilesResponse>(filesGet, {
      method: "GET",
      url: "http://localhost/api/files?q=kick&limit=100",
    });
    expect(search.body.files).toEqual([]);

    const collectionsResponse = await callRoute<{ collections: Array<{ id: string; fileCount: number }> }>(
      collectionsGet,
      { method: "GET", url: "http://localhost/api/collections" },
    );
    expect(collectionsResponse.body.collections.find((entry) => entry.id === collectionId)!.fileCount).toBe(0);

    const collectionFiles = await callRoute<{ files: Array<{ id: string }> }>(collectionsGet, {
      method: "GET",
      url: `http://localhost/api/collections?collectionId=${collectionId}`,
    });
    expect(collectionFiles.body.files).toEqual([]);

    const settingsResponse = await callRoute<{
      libraryRoots: string[];
      stats: { activeFiles: number; removedFiles: number };
    }>(settingsGet, { method: "GET" });
    expect(settingsResponse.body.libraryRoots).toEqual([ROOT_B]);
    expect(settingsResponse.body.stats.activeFiles).toBe(1);

    const directories = await callRoute(directoriesGet, {
      method: "GET",
      url: `http://localhost/api/directories?root=${encodeURIComponent(ROOT_A)}`,
    });
    expect(directories.status).toBe(400);

    const fileTags = await callRoute<{ tags: unknown[] }>(tagsGet, {
      method: "GET",
      url: `http://localhost/api/tags?fileId=${detachedFile}`,
    });
    expect(fileTags.body.tags).toEqual([]);

    for (const request of [
      callRoute(audioGet, { method: "GET", url: `http://localhost/api/audio?id=${detachedFile}` }),
      callRoute(waveformGet, { method: "GET", url: `http://localhost/api/waveform?id=${detachedFile}` }),
      callRoute(desktopFileGet, { method: "GET", url: `http://localhost/api/desktop/file?id=${detachedFile}` }),
    ]) {
      expect((await request).status).toBe(404);
    }
  });

  it("re-adding the same root reattaches its records with their organization data", async () => {
    await callRoute(settingsPost, { method: "POST", body: { action: "remove", path: ROOT_A } });

    const readded = await callRoute(settingsPost, {
      method: "POST",
      body: { action: "save", path: ROOT_A },
    });
    expect(readded.status).toBe(200);

    expect(rows().every((row) => row.detachedAt === null)).toBe(true);

    const list = await callRoute<FilesResponse>(filesGet, { method: "GET", url: "http://localhost/api/files?limit=100" });
    const kick = list.body.files.find((file) => file.id === detachedFile)!;
    expect(list.body.files).toHaveLength(3);
    expect(kick.tags!.map((tag) => tag.name)).toEqual(["drums"]);

    const collectionsResponse = await callRoute<{ collections: Array<{ id: string; fileCount: number }> }>(
      collectionsGet,
      { method: "GET", url: "http://localhost/api/collections" },
    );
    expect(collectionsResponse.body.collections.find((entry) => entry.id === collectionId)!.fileCount).toBe(1);
  });

  it("removing a root and forgetting its data deletes the rows and organization data", async () => {
    const forgotten = await callRoute(settingsPost, {
      method: "POST",
      body: { action: "forget", path: ROOT_A },
    });
    expect(forgotten.status).toBe(200);

    expect(rows().map((row) => row.path)).toEqual([`${ROOT_B}/pad.wav`]);
    expect(sqlite.prepare("SELECT COUNT(*) AS n FROM file_tags WHERE file_id = ?").get(detachedFile)).toEqual({ n: 0 });
    expect(sqlite.prepare("SELECT COUNT(*) AS n FROM file_collections WHERE file_id = ?").get(detachedFile)).toEqual({ n: 0 });
    expect(sqlite.prepare("SELECT COUNT(*) AS n FROM file_embeddings WHERE file_id = ?").get(detachedFile)).toEqual({ n: 0 });
  });

  it("reconciles an interrupted detach from the durable journal without resurrecting owned files", () => {
    // Simulate a crash after the settings change but before the file marking:
    // the intent is journaled and the root is already gone from settings.
    sqlite
      .prepare("INSERT INTO pending_root_changes (root, mode, created_at) VALUES (?, 'detach', ?)")
      .run(ROOT_A, new Date().toISOString());
    settings.setLibraryRoots([ROOT_B]);

    // A stale intent whose root is still owned is dropped, never applied.
    sqlite
      .prepare("INSERT INTO pending_root_changes (root, mode, created_at) VALUES (?, 'detach', ?)")
      .run(ROOT_B, new Date().toISOString());

    const recovery = roots.recover();
    expect(recovery.completed).toBe(1);
    expect(recovery.dropped).toBe(1);

    const after = rows();
    expect(after.find((row) => row.path === `${ROOT_A}/drums/kick.wav`)!.detachedAt).not.toBeNull();
    expect(after.find((row) => row.path === `${ROOT_B}/pad.wav`)!.detachedAt).toBeNull();
    expect(sqlite.prepare("SELECT COUNT(*) AS n FROM pending_root_changes").get()).toEqual({ n: 0 });
  });

  it("reconciles an interrupted forget by deleting the root's rows", () => {
    sqlite
      .prepare("INSERT INTO pending_root_changes (root, mode, created_at) VALUES (?, 'forget', ?)")
      .run(ROOT_A, new Date().toISOString());
    settings.setLibraryRoots([ROOT_B]);

    expect(roots.recover()).toEqual({ completed: 1, dropped: 0 });
    expect(rows().map((row) => row.path)).toEqual([`${ROOT_B}/pad.wav`]);
    expect(sqlite.prepare("SELECT COUNT(*) AS n FROM file_tags WHERE file_id = ?").get(detachedFile)).toEqual({ n: 0 });
  });

  it("does not resurrect detached records without the root being re-added", async () => {
    await callRoute(settingsPost, { method: "POST", body: { action: "remove", path: ROOT_A } });
    // A recovery pass with no pending intent must change nothing.
    expect(roots.recover()).toEqual({ completed: 0, dropped: 0 });
    const list = await callRoute<FilesResponse>(filesGet, { method: "GET", url: "http://localhost/api/files?limit=100" });
    expect(list.body.files.map((file) => file.id)).toEqual([ownedFile]);
  });
});
