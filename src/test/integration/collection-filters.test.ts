import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { audioFileRecord, createTestDatabase, type TestDatabase } from "@/test/fixtures";
import { SqliteAudioFileRepository } from "@/lib/database/file-repository";
import { SqliteTagRepository } from "@/lib/database/tag-repository";
import { SqliteCollectionRepository } from "@/lib/database/collection-repository";
import type { FileSearchQuery } from "@yard-core";

// Area: #272. Collection browsing must obey the complete Audio file query
// contract: search, favorites, root, directory, tag origin, removed state,
// ordering and paging all apply to Collection queries exactly as they do to
// the whole-library query, and the collection count agrees with its listing.

const NOW = () => new Date().toISOString();

let sqlite: TestDatabase;
let files: SqliteAudioFileRepository;
let tags: SqliteTagRepository;
let collections: SqliteCollectionRepository;

/** Filenames are unique, so ordering by filename is deterministic. */
function filenames(options?: FileSearchQuery): string[] {
  return files.getFiles({ limit: 100, ...options }).map((file) => file.filename);
}

function sorted(options?: FileSearchQuery): string[] {
  return filenames(options).sort();
}

beforeEach(() => {
  sqlite = createTestDatabase();
  files = new SqliteAudioFileRepository(sqlite);
  tags = new SqliteTagRepository(sqlite);
  collections = new SqliteCollectionRepository(sqlite);
});

afterEach(() => {
  sqlite.close();
});

/**
 * The fixture is built so every supported filter is discriminating: two
 * library roots, a nested directory and a root-level file (`directory IS
 * NULL`), favorites, two tags with all three origins, and one removed file
 * that is still a Collection member.
 */
function seedLibrary() {
  files.batchUpsertFiles(
    [
      { ...audioFileRecord({ path: "/rootA/drums/kick.wav", filename: "kick.wav", directory: "/rootA/drums" }), libraryRoot: "/rootA" },
      { ...audioFileRecord({ path: "/rootA/drums/snare.wav", filename: "snare.wav", directory: "/rootA/drums" }), libraryRoot: "/rootA" },
      { ...audioFileRecord({ path: "/rootA/hat.wav", filename: "hat.wav", directory: "/rootA" }), libraryRoot: "/rootA" },
      { ...audioFileRecord({ path: "/rootA/toplevel.wav", filename: "toplevel.wav" }), directory: null, libraryRoot: "/rootA" },
      { ...audioFileRecord({ path: "/rootB/crash.wav", filename: "crash.wav", directory: "/rootB" }), libraryRoot: "/rootB" },
      { ...audioFileRecord({ path: "/rootB/gone.wav", filename: "gone.wav", directory: "/rootB" }), libraryRoot: "/rootB" },
    ],
    NOW(),
  );

  const byName = new Map(files.getFiles({ limit: 100 }).map((file) => [file.filename, file.id]));
  const id = (name: string) => byName.get(name)!;

  const drums = tags.createTag("drums");
  const loud = tags.createTag("loud");
  tags.attachTagToFile(id("kick.wav"), drums);
  tags.attachTagToFile(id("snare.wav"), drums);
  tags.attachTagToFileWithOrigin(id("snare.wav"), loud, "deterministic");
  tags.attachTagToFileWithOrigin(id("crash.wav"), loud, "semantic_ai", 0.9);

  files.setFavorites([id("kick.wav")], true);
  files.batchMarkRemoved(["/rootB/gone.wav"], NOW(), NOW());

  // A Collection that already holds every file, including the removed one:
  // membership rows outlive removal, so the same filter must behave the same
  // scoped to the Collection as it does across the whole Library.
  const collectionId = collections.createCollection("All tracks");
  for (const file of files.getFiles({ limit: 100, showRemoved: true })) {
    collections.attachFileToCollection(file.id, collectionId);
  }

  return { collectionId, drums, loud };
}

describe("collection filters", () => {
  it("applies every supported filter identically with and without a collectionId", () => {
    const { collectionId, drums, loud } = seedLibrary();

    const cases: Array<{ label: string; options: FileSearchQuery; expected: string[] }> = [
      { label: "no filter", options: {}, expected: ["crash.wav", "hat.wav", "kick.wav", "snare.wav", "toplevel.wav"] },
      { label: "query", options: { query: "kick" }, expected: ["kick.wav"] },
      { label: "query substring (LIKE path)", options: { query: "ha" }, expected: ["hat.wav"] },
      { label: "query substring multi (LIKE path)", options: { query: "c" }, expected: ["crash.wav", "kick.wav"] },
      { label: "favorites", options: { favorites: true }, expected: ["kick.wav"] },
      { label: "directory", options: { directory: "/rootA/drums" }, expected: ["kick.wav", "snare.wav"] },
      { label: "libraryRoot", options: { libraryRoot: "/rootA" }, expected: ["hat.wav", "kick.wav", "snare.wav", "toplevel.wav"] },
      { label: "atLibraryRoot", options: { libraryRoot: "/rootA", atLibraryRoot: true }, expected: ["toplevel.wav"] },
      { label: "tagId", options: { tagId: drums }, expected: ["kick.wav", "snare.wav"] },
      { label: "other tagId", options: { tagId: loud }, expected: ["crash.wav", "snare.wav"] },
      { label: "tagOrigin manual", options: { tagOrigin: "manual" }, expected: ["kick.wav", "snare.wav"] },
      { label: "tagOrigin deterministic", options: { tagOrigin: "deterministic" }, expected: ["snare.wav"] },
      { label: "tagOrigin semantic_ai", options: { tagOrigin: "semantic_ai" }, expected: ["crash.wav"] },
      { label: "showRemoved", options: { showRemoved: true }, expected: ["crash.wav", "gone.wav", "hat.wav", "kick.wav", "snare.wav", "toplevel.wav"] },
      { label: "query and tagId", options: { query: "sn", tagId: drums }, expected: ["snare.wav"] },
      { label: "favorites and tagId", options: { favorites: true, tagId: drums }, expected: ["kick.wav"] },
      { label: "libraryRoot and tagId", options: { libraryRoot: "/rootA", tagId: drums }, expected: ["kick.wav", "snare.wav"] },
      { label: "libraryRoot and query", options: { libraryRoot: "/rootA", query: "t" }, expected: ["hat.wav", "toplevel.wav"] },
      { label: "directory and showRemoved", options: { directory: "/rootB", showRemoved: true }, expected: ["crash.wav", "gone.wav"] },
    ];

    for (const { label, options, expected } of cases) {
      // Whole-library listing and count agree, and equal the expected set.
      expect(sorted(options), `library listing for ${label}`).toEqual(expected);
      expect(files.getFileCount(options), `library count for ${label}`).toBe(expected.length);

      // The same filter scoped to a Collection returns the same rows, and the
      // Collection count agrees with its own listing.
      const scoped = { ...options, collectionId };
      expect(sorted(scoped), `collection listing for ${label}`).toEqual(expected);
      expect(files.getFileCount(scoped), `collection count for ${label}`).toBe(
        expected.length,
      );
    }
  });

  it("counts only the filters, not the page window", () => {
    const { collectionId, drums } = seedLibrary();

    // A tiny limit must not change the reported count, and a keyset cursor
    // (a page boundary) must never shrink the total.
    const options: FileSearchQuery = { collectionId, tagId: drums };
    expect(files.getFiles({ ...options, limit: 1 })).toHaveLength(1);
    expect(files.getFileCount(options)).toBe(2);
    expect(files.getFileCount({ ...options, limit: 1 })).toBe(2);
  });
});
