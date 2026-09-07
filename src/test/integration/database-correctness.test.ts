import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";
import { existsSync } from "node:fs";

import {
  audioFileRecord,
  callRoute,
  createScratchLibrary,
  createTestDatabase,
  type TestDatabase,
} from "@/test/fixtures";
import { SqliteAudioFileRepository } from "@/lib/database/file-repository";
import { SqliteTagRepository } from "@/lib/database/tag-repository";
import { SqliteCollectionRepository } from "@/lib/database/collection-repository";
import { SqliteSettingsRepository } from "@/lib/database/settings-repository";
import { SqliteBrowseRepository } from "@/lib/database/browse-repository";
import { initializeDatabaseSchema } from "@/lib/database/migrations";
import { immediateSubdirectories } from "@/lib/database/browse-repository";
import { SQLITE_MAX_VARIABLES } from "@/lib/database/sql-parameters";

// Area: database correctness (#137). Replaces nine files and 55 tests that
// covered this ground one repository method at a time.
//
// What survives is the behaviour that is genuinely hard to get right against
// SQLite: escaping, the bind-variable ceiling, agreement between a listing and
// its count, stable ordering under paging, and transactional atomicity —
// driven through the routes that use the repositories wherever a route owns
// the envelope, so api/files/route.ts does not fall out of coverage.

const state = vi.hoisted(() => ({
  files: null as SqliteAudioFileRepository | null,
  tags: null as SqliteTagRepository | null,
  collections: null as SqliteCollectionRepository | null,
  libraryRoots: [] as string[],
}));

vi.mock("@/lib/db", () => ({
  getFiles: (...args: never[]) => state.files!.getFiles(...args),
  getFileCount: (...args: never[]) => state.files!.getFileCount(...args),
  getTagsForFiles: (ids: string[]) => state.tags!.getTagsForFiles(ids),
  setFileTagBatch: (ids: string[], tagId: string, attach: boolean) =>
    state.files!.setFileTagBatch(ids, tagId, attach),
  toggleFavorite: (id: string) => state.files!.toggleFavorite(id),
  setFavorites: (ids: string[], value: boolean) =>
    state.files!.setFavorites(ids, value),
  attachTagToFile: (fileId: string, tagId: string) =>
    state.tags!.attachTagToFile(fileId, tagId),
  detachTagFromFile: (fileId: string, tagId: string) =>
    state.tags!.detachTagFromFile(fileId, tagId),
  getAllTags: () => state.tags!.getAllTags(),
  getTagsForFile: (fileId: string) => state.tags!.getTagsForFile(fileId),
  createTag: (name: string) => state.tags!.createTag(name),
  deleteTag: (id: string) => state.tags!.deleteTag(id),
  renameTag: (id: string, name: string) => state.tags!.renameTag(id, name),
  updateTagColor: (id: string, color: string | null) =>
    state.tags!.updateTagColor(id, color),
  getAllCollections: () => state.collections!.getAllCollections(),
  createCollection: (name: string) => state.collections!.createCollection(name),
  deleteCollection: (id: string) => state.collections!.deleteCollection(id),
  renameCollection: (id: string, name: string) =>
    state.collections!.renameCollection(id, name),
  updateCollectionColor: (id: string, color: string | null) =>
    state.collections!.updateCollectionColor(id, color),
  attachFileToCollection: (fileId: string, collectionId: string) =>
    state.collections!.attachFileToCollection(fileId, collectionId),
  detachFileFromCollection: (fileId: string, collectionId: string) =>
    state.collections!.detachFileFromCollection(fileId, collectionId),
  getFileById: (id: string) => state.files!.getFileById(id),
  getFilesByIds: (ids: string[]) => state.files!.getFilesByIds(ids),
  getLibraryRoots: () => state.libraryRoots,
  markFileRemoved: (path: string, removedAt: string) =>
    state.files!.markFileRemoved(path, removedAt),
  batchMarkRemoved: (paths: string[], removedAt: string, now: string) =>
    state.files!.batchMarkRemoved(paths, removedAt, now),
}));

import {
  GET as getFilesRoute,
  PATCH as patchFilesRoute,
  DELETE as deleteFilesRoute,
} from "@/app/api/files/route";
import { POST as postTag, PATCH as patchTag, GET as getTagsRoute, DELETE as deleteTagRoute } from "@/app/api/tags/route";
import {
  POST as postCollection,
  PATCH as patchCollection,
  DELETE as deleteCollectionRoute,
} from "@/app/api/collections/route";

let sqlite: TestDatabase;
let files: SqliteAudioFileRepository;
let tags: SqliteTagRepository;
let collections: SqliteCollectionRepository;

const NOW = () => new Date().toISOString();

function seed(paths: string[]) {
  files.batchUpsertFiles(
    paths.map((path) => audioFileRecord({ path, filename: path.split("/").pop() })),
    NOW(),
  );
  return files.getFiles({ limit: paths.length + 10 });
}

/** Three named files behind the route mock, for the route-driven halves. */
function seedStandardFiles() {
  state.files!.batchUpsertFiles(
    ["kick.wav", "snare.wav", "hat.wav"].map((filename) =>
      audioFileRecord({ path: `/lib/${filename}`, filename }),
    ),
    NOW(),
  );
  return state.files!.getFiles({ limit: 10 });
}

beforeEach(() => {
  sqlite = createTestDatabase();
  files = new SqliteAudioFileRepository(sqlite);
  tags = new SqliteTagRepository(sqlite);
  collections = new SqliteCollectionRepository(sqlite);
  state.files = files;
  state.tags = tags;
  state.collections = collections;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  sqlite.close();
  vi.restoreAllMocks();
});

describe("database correctness", () => {
  it("treats LIKE metacharacters in a search as literal text", () => {
    seed([
      "/lib/100% wet.wav",
      "/lib/snare_hit.wav",
      "/lib/back\\slash.wav",
      "/lib/plain.wav",
    ]);

    // Each of these is a LIKE wildcard or the escape character itself. If any
    // leaks into the pattern unescaped, the query matches far too much.
    expect(files.getFiles({ query: "100%" }).map((f) => f.filename)).toEqual([
      "100% wet.wav",
    ]);
    expect(files.getFiles({ query: "snare_" }).map((f) => f.filename)).toEqual([
      "snare_hit.wav",
    ]);
    expect(
      files.getFiles({ query: "back\\" }).map((f) => f.filename),
    ).toEqual(["back\\slash.wav"]);
  });

  it.fails(
    "agrees between getFiles and getFileCount across every filter (B03)",
    () => {
      const seeded = seed(["/lib/kick.wav", "/lib/snare.wav", "/lib/hat.wav"]);
      const collectionId = collections.createCollection("Session");
      const tagId = tags.createTag("Loud");
      for (const file of seeded.slice(0, 2)) {
        collections.attachFileToCollection(file.id, collectionId);
        files.setFileTagBatch([file.id], tagId, true);
      }
      files.setFavorites([seeded[0].id], true);

      // Collection plus tag already agrees; that is the corner the deleted
      // 29-test file checked, under a name that claimed the whole matrix.
      expect(files.getFiles({ collectionId, tagId })).toHaveLength(
        files.getFileCount({ collectionId, tagId }),
      );

      // The collection branch of the query builder drops `query` and
      // `favorites` entirely, so these disagree with reality and each other.
      for (const options of [
        { collectionId, query: "DOES_NOT_EXIST" },
        { collectionId, favorites: true },
        { collectionId, tagId, query: "kick" },
      ]) {
        expect(
          files.getFiles(options).length,
          `listing must match count for ${JSON.stringify(options)}`,
        ).toBe(files.getFileCount(options));
      }

      expect(
        files.getFiles({ collectionId, query: "DOES_NOT_EXIST" }),
        "a collection search with no match must return nothing",
      ).toHaveLength(0);
    },
  );

  it("chunks batch work past the SQLite bind-variable ceiling, including through the PATCH route", async () => {
    const total = SQLITE_MAX_VARIABLES + 25;
    files.batchUpsertFiles(
      Array.from({ length: total }, (_, index) =>
        audioFileRecord({ path: `/lib/bulk-${index}.wav` }),
      ),
      NOW(),
    );
    const ids = files.getFiles({ limit: total + 10 }).map((file) => file.id);
    expect(ids).toHaveLength(total);

    const tagId = tags.createTag("bulk");

    // One transaction, however many chunks it takes underneath.
    const realTransaction = sqlite.transaction.bind(sqlite);
    let transactions = 0;
    vi.spyOn(sqlite, "transaction").mockImplementation(((
      fn: (...args: never[]) => unknown,
    ) => {
      transactions += 1;
      return realTransaction(fn as never);
    }) as never);

    files.setFileTagBatch(ids, tagId, true);

    expect(transactions).toBe(1);
    expect(tags.getTagsForFiles(ids).size).toBe(total);

    // The same batch entrypoints are reachable through the files PATCH route,
    // which owns the envelope validation around them.
    const tagged = await callRoute(patchFilesRoute, {
      method: "PATCH",
      url: "http://localhost/api/files",
      body: { action: "setFileTag", fileIds: ids.slice(0, 3), tagId, attached: true },
    });
    expect(tagged.status).toBe(200);

    const favourited = await callRoute(patchFilesRoute, {
      method: "PATCH",
      url: "http://localhost/api/files",
      body: { action: "setFavorites", ids: ids.slice(0, 3), isFavorite: true },
    });
    expect(favourited.status).toBe(200);
    expect(state.files!.getFileCount({ favorites: true })).toBe(3);
  });

  it("rolls a batch back as a unit and maps bad input to client errors", async () => {
    const seeded = seed(["/lib/a.wav", "/lib/b.wav"]);
    const ids = seeded.map((file) => file.id);
    const tagId = tags.createTag("bulk");

    expect(() =>
      files.setFileTagBatch([...ids, "missing-id"], tagId, true),
    ).toThrow(/does not exist/);
    expect(tags.getTagsForFiles(ids).size).toBe(0);

    expect(() => files.setFavorites([...ids, "missing-id"], true)).toThrow(
      /does not exist/,
    );
    expect(files.getFileCount({ favorites: true })).toBe(0);

    // Wrong types on a known action are refused before touching the database.
    for (const body of [
      { action: "setFileTag", fileIds: ids, tagId, attached: "yes" },
      { action: "setFileTag", fileIds: "not-an-array", tagId, attached: true },
      { action: "setFavorites", ids, isFavorite: "yes" },
    ]) {
      const response = await callRoute(patchFilesRoute, {
        method: "PATCH",
        url: "http://localhost/api/files",
        body,
      });
      expect(response.status, JSON.stringify(body)).toBe(400);
    }

    // Malformed and unknown input must map to a controlled client error, not a
    // thrown exception escaping the handler.
    const malformed = await callRoute(patchFilesRoute, {
      method: "PATCH",
      url: "http://localhost/api/files",
      rawBody: "{not json",
    });
    expect(malformed.status).toBeGreaterThanOrEqual(400);
    expect(malformed.status).toBeLessThan(500);

    const unknown = await callRoute(patchFilesRoute, {
      method: "PATCH",
      url: "http://localhost/api/files",
      body: { action: "setFavorites", ids: ["missing-id"], isFavorite: true },
    });
    expect(unknown.status, "an unknown id is a 404, not a 500").toBe(404);

    // The single-file actions reach the same repositories through the route.
    const toggled = await callRoute(patchFilesRoute, {
      method: "PATCH",
      url: "http://localhost/api/files",
      body: { action: "toggleFavorite", id: ids[0] },
    });
    expect(toggled.status).toBe(200);
    expect(files.getFileCount({ favorites: true }), "the route toggled it on").toBe(1);

    const explicit = await callRoute(patchFilesRoute, {
      method: "PATCH",
      url: "http://localhost/api/files",
      body: { action: "toggleFavorite", id: ids[0], isFavorite: false },
    });
    expect(explicit.status).toBe(200);
    expect(state.files!.getFileCount({ favorites: true })).toBe(0);

    const attached = await callRoute(patchFilesRoute, {
      method: "PATCH",
      url: "http://localhost/api/files",
      body: { action: "attachTag", id: ids[0], tagId },
    });
    expect(attached.status).toBe(200);
    expect(state.tags!.getTagsForFiles([ids[0]]).size).toBe(1);

    const detached = await callRoute(patchFilesRoute, {
      method: "PATCH",
      url: "http://localhost/api/files",
      body: { action: "detachTag", id: ids[0], tagId },
    });
    expect(detached.status).toBe(200);
    expect(state.tags!.getTagsForFiles([ids[0]]).size).toBe(0);

    const unknownAction = await callRoute(patchFilesRoute, {
      method: "PATCH",
      url: "http://localhost/api/files",
      body: { action: "renameEverything" },
    });
    expect(unknownAction.status, "an unknown action is a 400").toBe(400);

    // Deletion goes through the DELETE route against real files on disk: only
    // indexed files inside the Library roots are unlinked, the rest — outside
    // files, unknown ids, soft deletes, malformed ids — stay put or fail shut.
    const scratch = createScratchLibrary("foleyard-db-delete-");
    try {
      const libDir = scratch.directory("library");
      const inside = scratch.writeFile("library/inside.wav");
      const outside = scratch.writeFile("private.wav");
      const soft = scratch.writeFile("library/soft.wav");
      state.files!.batchUpsertFiles(
        [inside, outside, soft].map((path) =>
          audioFileRecord({ path, filename: path.split("/").pop() }),
        ),
        NOW(),
      );
      const indexed = state.files!.getFiles({ limit: 10 });
      const insideId = indexed.find((f) => f.path === inside)!.id;
      const outsideId = indexed.find((f) => f.path === outside)!.id;
      const softId = indexed.find((f) => f.path === soft)!.id;
      state.libraryRoots = [libDir];

      const deleted = await callRoute<{ removed: string[]; failed: Array<{ id: string }> }>(
        deleteFilesRoute,
        {
          method: "DELETE",
          url: "http://localhost/api/files",
          body: { fileIds: [insideId, outsideId, "unknown"], permanent: true },
        },
      );
      expect(deleted.status).toBe(200);
      expect(deleted.body.removed).toEqual([insideId]);
      expect(deleted.body.failed.map((f) => f.id)).toEqual([outsideId, "unknown"]);

      const kept = await callRoute(deleteFilesRoute, {
        method: "DELETE",
        url: "http://localhost/api/files",
        body: { fileIds: [softId], permanent: false },
      });
      expect(kept.status).toBe(200);

      const malformedDelete = await callRoute(deleteFilesRoute, {
        method: "DELETE",
        url: "http://localhost/api/files",
        body: { fileIds: [softId, 3], permanent: true },
      });
      expect(malformedDelete.status, "malformed ids are refused before touching files").toBe(400);

      expect(existsSync(inside), "a permanent delete unlinks the file").toBe(false);
      expect(existsSync(outside), "a file outside the roots is never unlinked").toBe(true);
      expect(existsSync(soft), "a soft delete leaves disk contents intact").toBe(true);
      expect(
        state.files!.getFileById(insideId)?.removedAt,
        "a permanent delete marks the row removed",
      ).not.toBeNull();
      expect(
        state.files!.getFileById(softId)?.removedAt,
        "a soft delete marks the row without unlinking",
      ).not.toBeNull();
      expect(
        state.files!.getFileById(outsideId)?.removedAt,
        "an outside-roots file is not marked removed",
      ).toBeNull();
    } finally {
      scratch.dispose();
      state.libraryRoots = [];
    }
  });

  it("lists, searches and sorts server-side with stable paging", async () => {
    seedStandardFiles();

    const all = await callRoute<{
      files: unknown[];
      favoritesTotal: number;
      hasMore: boolean;
    }>(getFilesRoute, { method: "GET", url: "http://localhost/api/files" });
    expect(all.status).toBe(200);
    expect(all.body.files).toHaveLength(3);
    expect(all.body.hasMore, "a short page is the last page").toBe(false);
    expect(all.body.favoritesTotal, "the count travels with the page").toBe(0);

    // Invalid paging and sort keys are refused rather than silently defaulted.
    for (const bad of ["limit=0", "offset=-1", "sortKey=nope", "sortDir=sideways"]) {
      const response = await callRoute(getFilesRoute, {
        method: "GET",
        url: `http://localhost/api/files?${bad}`,
      });
      expect(response.status, `${bad} must be refused`).toBe(400);
    }

    const searched = await callRoute<{ files: Array<{ filename: string }> }>(
      getFilesRoute,
      { method: "GET", url: "http://localhost/api/files?q=kick" },
    );
    expect(searched.body.files.map((file) => file.filename)).toEqual([
      "kick.wav",
    ]);

    const sorted = await callRoute<{ files: Array<{ filename: string }> }>(
      getFilesRoute,
      {
        method: "GET",
        url: "http://localhost/api/files?sortKey=filename&sortDir=desc",
      },
    );
    expect(sorted.body.files.map((file) => file.filename)).toEqual([
      "snare.wav",
      "kick.wav",
      "hat.wav",
    ]);

    // Paging the sorted listing must partition it, not overlap or drop rows.
    const page = (offset: number) =>
      files
        .getFiles({ sortKey: "filename", sortDir: "asc", limit: 2, offset })
        .map((file) => file.id);
    expect([...page(0), ...page(2)]).toEqual(
      files.getFiles({ sortKey: "filename", sortDir: "asc" }).map((f) => f.id),
    );

    // A filtered route listing travels the same query builder as the count.
    const tagId = state.tags!.createTag("Loud");
    const listed = state.files!.getFiles({ limit: 10 });
    state.collections!.attachFileToCollection(listed[0].id, state.collections!.createCollection("Session"));
    const filtered = await callRoute<{ files: unknown[] }>(getFilesRoute, {
      method: "GET",
      url: `http://localhost/api/files?collectionId=${state.collections!.getAllCollections()[0].id}&tagId=${tagId}`,
    });
    expect(filtered.status).toBe(200);

    // The single-record lookups behind the routes: missing ids and paths are
    // null rather than throws, and path batches partition the same way pages do.
    expect(files.getFileById("missing-id")).toBeNull();
    expect(files.getFileByPath("/lib/missing.wav")).toBeNull();
    const byId = files.getFileById(listed[0].id);
    expect(files.getFileByPath(byId!.path)?.id).toBe(byId!.id);
    const paths = listed.slice(0, 2).map((f) => f.path);
    expect(files.getFilesByPaths(paths).map((f) => f.id).sort()).toEqual(
      listed.slice(0, 2).map((f) => f.id).sort(),
    );
    expect(files.getFilesByPaths([])).toEqual([]);

    // Removal is a flag, not a delete: default listings hide removed rows,
    // showRemoved and the including-removed listing still see them.
    files.batchMarkRemoved([listed[0].path], NOW(), NOW());
    expect(files.getFileCount()).toBe(2);
    expect(files.getFileCount({ showRemoved: true })).toBe(3);
    expect(files.getAllFilesIncludingRemoved()).toHaveLength(3);

    // A single upsert inserts, and re-upserting the same path updates it.
    const rec = audioFileRecord({ path: "/lib/up.wav", filename: "up.wav" });
    files.upsertFile(rec);
    expect(files.getFileByPath("/lib/up.wav")?.filename).toBe("up.wav");
    files.upsertFile({ ...rec, duration: 9 });
    expect(files.getFileByPath("/lib/up.wav")?.duration).toBe(9);
  });

  it.fails("converts a smart collection atomically within the bind limit (B09)", () => {
    const matching = Math.ceil(SQLITE_MAX_VARIABLES / 2) + 50;
    files.batchUpsertFiles(
      Array.from({ length: matching }, (_, index) =>
        audioFileRecord({
          path: `/lib/kick-${index}.wav`,
          filename: `kick-${index}.wav`,
        }),
      ),
      NOW(),
    );
    const collectionId = collections.createSmartCollection(
      "Smart",
      JSON.stringify({ q: "kick" }),
    );

    // Every other batch path in this repository chunks by SQLITE_MAX_VARIABLES.
    // convertToRegularCollection builds one values array for every match and
    // issues it as a single statement, so the ceiling is the runtime's, not
    // ours — it simply fails at whatever size that turns out to be.
    const realPrepare = sqlite.prepare.bind(sqlite);
    let widest = 0;
    vi.spyOn(sqlite, "prepare").mockImplementation(((sql: string) => {
      if (/file_collections/i.test(sql)) {
        widest = Math.max(widest, (sql.match(/\?/g) ?? []).length);
      }
      return realPrepare(sql);
    }) as never);

    collections.convertToRegularCollection(collectionId);
    vi.restoreAllMocks();

    expect(files.getFileCount({ collectionId })).toBe(matching);
    expect(
      widest,
      `one statement bound ${widest} variables, over the ${SQLITE_MAX_VARIABLES} this repo chunks at`,
    ).toBeLessThanOrEqual(SQLITE_MAX_VARIABLES);

    // And the conversion is not transactional: fail the finishing update and
    // the inserted memberships are left behind instead of rolling back.
    const secondId = collections.createSmartCollection(
      "Smart two",
      JSON.stringify({ q: "kick" }),
    );
    const failingPrepare = sqlite.prepare.bind(sqlite);
    vi.spyOn(sqlite, "prepare").mockImplementation(((sql: string) => {
      if (/UPDATE\s+"?collections"?/i.test(sql)) {
        throw new Error("injected failure");
      }
      return failingPrepare(sql);
    }) as never);

    expect(() => collections.convertToRegularCollection(secondId)).toThrow(
      /injected failure/,
    );
    vi.restoreAllMocks();

    expect(
      sqlite
        .prepare("SELECT COUNT(*) AS n FROM file_collections WHERE collection_id = ?")
        .get(secondId) as { n: number },
      "a failed conversion must leave no memberships behind",
    ).toEqual({ n: 0 });
  });

  it("keeps settings, colours and tag/collection creation round-tripping, including through the routes", async () => {
    const settings = new SqliteSettingsRepository(sqlite);
    settings.setLibraryRoots(["/new"]);

    // The legacy single-root key and the current list key are written together,
    // so a reader of either sees the same thing.
    expect(settings.getLibraryRoots()).toEqual(["/new"]);
    expect(settings.getLibraryRoot()).toBe("/new");
    const raw = (key: string) =>
      (
        sqlite.prepare("SELECT value FROM settings WHERE key = ?").get(key) as
          | { value: string | null }
          | undefined
      )?.value ?? null;
    expect(raw("libraryRoot")).toBe("/new");
    expect(raw("libraryRoots")).toBe(JSON.stringify(["/new"]));

    // Both keys are written in one transaction: a failure between them cannot
    // desynchronise the pair.
    settings.setLibraryRoots(["/old"]);
    const internals = settings as unknown as { db: Record<string, unknown> };
    const drizzleDb = internals.db;
    const originalInsert = (drizzleDb["insert"] as (...args: unknown[]) => unknown).bind(drizzleDb);
    let insertCalls = 0;
    drizzleDb["insert"] = (...args: unknown[]) => {
      insertCalls += 1;
      if (insertCalls === 2) {
        throw new Error("simulated write failure");
      }
      return originalInsert(...args);
    };
    expect(() => settings.setLibraryRoots(["/new"])).toThrow("simulated write failure");
    drizzleDb["insert"] = originalInsert;
    expect(settings.getLibraryRoots()).toEqual(["/old"]);
    expect(raw("libraryRoot")).toBe("/old");
    expect(raw("libraryRoots")).toBe(JSON.stringify(["/old"]));

    // A corrupt current key falls back to the legacy one rather than failing.
    sqlite.prepare("UPDATE settings SET value = ? WHERE key = ?").run("{nope", "libraryRoots");
    expect(settings.getLibraryRoots()).toEqual(["/old"]);
    settings.setLibraryRoots(["/old"]);

    // The remaining settings stores round-trip through the same repository.
    settings.addLibraryRoot("/extra");
    expect(settings.getLibraryRoots()).toEqual(["/old", "/extra"]);
    settings.removeLibraryRoot("/old");
    expect(settings.getLibraryRoots()).toEqual(["/extra"]);

    expect(settings.getExtensionEnabled("sound-shelf")).toBe(false);
    settings.setExtensionEnabled("sound-shelf", true);
    expect(settings.getExtensionEnabled("sound-shelf")).toBe(true);

    expect(settings.getOnboardingVersion()).toBe(0);
    settings.setOnboardingVersion(3);
    expect(settings.getOnboardingVersion()).toBe(3);

    seed(["/lib/a.wav", "/lib/b.wav"]);
    files.batchMarkRemoved(["/lib/a.wav"], NOW(), NOW());
    expect(settings.getLibraryStats()).toEqual({ activeFiles: 1, removedFiles: 1 });

    const tagId = tags.createTag("Loud");
    tags.updateTagColor(tagId, "#ff0000");
    expect(tags.getAllTags().find((tag) => tag.id === tagId)?.color).toBe(
      "#ff0000",
    );

    const collectionId = collections.createCollection("Session");
    collections.updateCollectionColor(collectionId, "#00ff00");
    expect(
      collections.getAllCollections().find((c) => c.id === collectionId)?.color,
    ).toBe("#00ff00");

    // Creation and renaming through the routes reach the same repositories,
    // refusing duplicates and bad names on the way.
    for (const post of [postTag, postCollection]) {
      const created = await callRoute(post, {
        url: "http://localhost/api/test",
        body: { name: "Impacts" },
      });
      expect(created.status).toBe(200);

      const duplicate = await callRoute<{ error: string }>(post, {
        url: "http://localhost/api/test",
        body: { name: "Impacts" },
      });
      expect(duplicate.status).toBe(409);
      expect(duplicate.body.error).toMatch(/already exists/i);

      const badName = await callRoute(post, {
        url: "http://localhost/api/test",
        body: { name: 42 },
      });
      expect(badName.status).toBe(400);
    }

    const loudId = state.tags!.createTag("Soft");
    const renamed = await callRoute(patchTag, {
      method: "PATCH",
      url: "http://localhost/api/tags",
      body: { tagId: loudId, name: "Softer" },
    });
    expect(renamed.status).toBe(200);
    expect(state.tags!.getAllTags().find((tag) => tag.id === loudId)?.name).toBe(
      "Softer",
    );

    // Attaching what is not there is a 404 with a readable error, on both
    // the tag and the collection creation routes.
    const missingTag = await callRoute<{ error: string }>(postTag, {
      url: "http://localhost/api/test",
      body: { fileId: "missing", tagId: "missing" },
    });
    expect(missingTag.status).toBe(404);
    expect(missingTag.body.error).toMatch(/does not exist/i);

    const missingCollection = await callRoute<{ error: string }>(postCollection, {
      url: "http://localhost/api/test",
      body: { fileId: "missing", collectionId: "missing" },
    });
    expect(missingCollection.status).toBe(404);
    expect(missingCollection.body.error).toMatch(/does not exist/i);

    // The tag and collection detail routes reach the same stores: lookup by
    // file, rename and recolour through PATCH, removal through DELETE.
    seed(["/lib/lookup.wav"]);
    const lookupId = files.getFiles({ limit: 10 }).find((f) => f.path === "/lib/lookup.wav")!.id;
    const lookupTag = state.tags!.createTag("Lookup");
    state.tags!.attachTagToFile(lookupId, lookupTag);
    const tagsForFile = await callRoute<{ tags: Array<{ id: string }> }>(getTagsRoute, {
      method: "GET",
      url: `http://localhost/api/tags?fileId=${lookupId}`,
    });
    expect(tagsForFile.status).toBe(200);
    expect(tagsForFile.body.tags.map((t) => t.id)).toEqual([lookupTag]);

    const renamedCollection = await callRoute(patchCollection, {
      method: "PATCH",
      url: "http://localhost/api/collections",
      body: { action: "rename", collectionId, name: "Evening" },
    });
    expect(renamedCollection.status).toBe(200);
    expect(
      state.collections!.getAllCollections().find((c) => c.id === collectionId)?.name,
    ).toBe("Evening");

    const recoloured = await callRoute(patchCollection, {
      method: "PATCH",
      url: "http://localhost/api/collections",
      body: { action: "update-color", collectionId, color: "#0000ff" },
    });
    expect(recoloured.status).toBe(200);

    const removedTag = await callRoute(deleteTagRoute, {
      method: "DELETE",
      url: "http://localhost/api/tags",
      body: { tagId: loudId },
    });
    expect(removedTag.status).toBe(200);
    expect(state.tags!.getAllTags().some((t) => t.id === loudId)).toBe(false);

    const removedCollection = await callRoute(deleteCollectionRoute, {
      method: "DELETE",
      url: "http://localhost/api/collections",
      body: { collectionId },
    });
    expect(removedCollection.status).toBe(200);
    expect(
      state.collections!.getAllCollections().some((c) => c.id === collectionId),
    ).toBe(false);

    // Databases created before the colour columns migrate forward: the
    // columns appear and colours round-trip from null.
    const legacy = new Database(":memory:");
    try {
      legacy.pragma("foreign_keys = ON");
      legacy.exec(`
        CREATE TABLE tags (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL UNIQUE,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE collections (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
      `);
      initializeDatabaseSchema(legacy);
      const columns = (table: string) =>
        (
          legacy.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
        ).map((column) => column.name);
      expect(columns("tags")).toContain("color");
      expect(columns("collections")).toContain("color");

      const legacyTags = new SqliteTagRepository(legacy);
      const legacyId = legacyTags.createTag("impact");
      expect(legacyTags.getAllTags()[0].color).toBeNull();
      legacyTags.updateTagColor(legacyId, "#f0503c");
      expect(legacyTags.getAllTags()[0].color).toBe("#f0503c");
      legacyTags.updateTagColor(legacyId, null);
      expect(legacyTags.getAllTags()[0].color).toBeNull();
    } finally {
      legacy.close();
    }
  });

  it("normalises separators identically for parent and child directories", () => {
    // Windows writes backslashes into the index; browsing compares them against
    // forward-slash paths from the UI.
    expect(
      immediateSubdirectories(
        ["foley\\wood\\hits", "foley/wood/scrapes", "foley/metal"],
        "foley\\wood",
      ),
    ).toEqual(["foley/wood/hits", "foley/wood/scrapes"]);
    expect(
      immediateSubdirectories(["foley\\wood", "foley/metal"], null),
    ).toEqual(["foley"]);

    // The repository over the same idea: distinct directories, sorted, with
    // removed files excluded.
    const browse = new SqliteBrowseRepository(sqlite);
    files.batchUpsertFiles(
      [
        audioFileRecord({ path: "/lib/drums/kick.wav", filename: "kick.wav", directory: "/lib/drums" }),
        audioFileRecord({ path: "/lib/drums/snare.wav", filename: "snare.wav", directory: "/lib/drums" }),
        audioFileRecord({ path: "/lib/bass/sub.wav", filename: "sub.wav", directory: "/lib/bass" }),
        audioFileRecord({ path: "/lib/gone.wav", filename: "gone.wav", directory: "/lib/gone", removedAt: NOW() }),
      ],
      NOW(),
    );
    expect(browse.getUniqueDirectories()).toEqual(["/lib/bass", "/lib/drums"]);
  });
});

