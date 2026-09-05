import Database from "better-sqlite3";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { initializeDatabaseSchema } from "../migrations";
import { SqliteAudioFileRepository } from "../file-repository";
import { SqliteTagRepository } from "../tag-repository";

function createRepos() {
  const sqlite = new Database(":memory:");
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  initializeDatabaseSchema(sqlite);
  return {
    sqlite,
    files: new SqliteAudioFileRepository(sqlite),
    tags: new SqliteTagRepository(sqlite),
  };
}

function scanRecord(index: number) {
  return {
    path: `/music/batch-${index}.mp3`,
    filename: `batch-${index}.mp3`,
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
}

describe("file batch mutations", () => {
  let sqlite: Database.Database;
  let files: SqliteAudioFileRepository;
  let tags: SqliteTagRepository;

  beforeEach(() => {
    ({ sqlite, files, tags } = createRepos());
  });

  it("tags 500 files in a single transaction", () => {
    const total = 500;
    files.batchUpsertFiles(
      Array.from({ length: total }, (_, index) => scanRecord(index)),
      new Date().toISOString(),
    );
    const tagId = tags.createTag("bulk");
    const ids = files.getFiles({ limit: total + 10 }).map((file) => file.id);

    const original = sqlite.transaction.bind(sqlite);
    let txnCount = 0;
    vi.spyOn(sqlite, "transaction").mockImplementation(((fn: (...args: never[]) => unknown) => {
      txnCount += 1;
      return original(fn as never);
    }) as never);

    files.setFileTagBatch(ids, tagId, true);

    expect(txnCount).toBe(1);
    const tagged = tags.getTagsForFiles(ids);
    expect(tagged.size).toBe(total);
    for (const id of ids) {
      expect(tagged.get(id)?.map((tag) => tag.id)).toEqual([tagId]);
    }
  });

  it("rolls back the whole batch when one file id is unknown", () => {
    files.batchUpsertFiles([scanRecord(1), scanRecord(2)], new Date().toISOString());
    const tagId = tags.createTag("bulk");
    const ids = files.getFiles({ limit: 10 }).map((file) => file.id);

    expect(() => files.setFileTagBatch([...ids, "missing-id"], tagId, true)).toThrow(
      /does not exist/,
    );

    const tagged = tags.getTagsForFiles(ids);
    expect(tagged.size).toBe(0);
  });

  it("rolls back favourite flags when one file id is unknown", () => {
    files.batchUpsertFiles([scanRecord(1), scanRecord(2)], new Date().toISOString());
    const ids = files.getFiles({ limit: 10 }).map((file) => file.id);

    expect(() => files.setFavorites([...ids, "missing-id"], true)).toThrow(/does not exist/);
    expect(files.getFileCount({ favorites: true })).toBe(0);
  });

  it("sets favourites with an explicit target state", () => {
    files.batchUpsertFiles([scanRecord(1), scanRecord(2)], new Date().toISOString());
    const ids = files.getFiles({ limit: 10 }).map((file) => file.id);

    files.setFavorites(ids, true);
    expect(files.getFileCount({ favorites: true })).toBe(2);

    files.setFavorites([ids[0]], false);
    expect(files.getFileCount({ favorites: true })).toBe(1);
  });

  it("detaches a tag in one transaction and ignores empty batches", () => {
    files.batchUpsertFiles([scanRecord(1)], new Date().toISOString());
    const tagId = tags.createTag("bulk");
    const [id] = files.getFiles({ limit: 10 }).map((file) => file.id);

    files.setFileTagBatch([id], tagId, true);
    expect(tags.getTagsForFiles([id]).get(id)).toHaveLength(1);

    files.setFileTagBatch([id], tagId, false);
    expect(tags.getTagsForFiles([id]).size).toBe(0);

    expect(() => files.setFavorites([], true)).not.toThrow();
    expect(() => files.setFileTagBatch([], tagId, true)).not.toThrow();
  });
});
