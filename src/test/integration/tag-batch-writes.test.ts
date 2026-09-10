import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { audioFileRecord, createTestDatabase, type TestDatabase } from "@/test/fixtures";
import { SqliteAudioFileRepository } from "@/lib/database/file-repository";
import { SqliteTagRepository } from "@/lib/database/tag-repository";

// Area: #258. Batch tag writes land in one transaction, stay idempotent on a
// retried job, and keep the manual-wins origin rule.

describe("attachTagsBatch", () => {
  let sqlite: TestDatabase;
  let files: SqliteAudioFileRepository;
  let tags: SqliteTagRepository;
  let fileId: string;

  beforeEach(() => {
    sqlite = createTestDatabase();
    files = new SqliteAudioFileRepository(sqlite);
    tags = new SqliteTagRepository(sqlite);
    files.batchUpsertFiles(
      [audioFileRecord({ path: "/lib/kick.wav", filename: "kick.wav" })],
      new Date().toISOString(),
    );
    fileId = files.getFileByPath("/lib/kick.wav")!.id;
  });

  afterEach(() => {
    sqlite.close();
  });

  it("writes many rows in one transaction and is idempotent on retry", () => {
    const thunder = tags.createTag("thunder");
    const rain = tags.createTag("rain");
    tags.attachTagsBatch([
      { fileId, tagId: thunder, origin: "deterministic" },
      { fileId, tagId: rain, origin: "deterministic" },
    ]);
    expect(tags.getTagsForFile(fileId).map((tag) => tag.id).sort()).toEqual(
      [thunder, rain].sort(),
    );

    // A retried job re-attaches the same pairs; the unique pair upserts.
    tags.attachTagsBatch([
      { fileId, tagId: thunder, origin: "deterministic" },
      { fileId, tagId: rain, origin: "deterministic" },
    ]);
    const counts = sqlite
      .prepare("SELECT COUNT(*) AS n FROM file_tags WHERE file_id = ?")
      .get(fileId) as { n: number };
    expect(counts.n).toBe(2);
  });

  it("keeps manual attachments from being downgraded by automatic ones", () => {
    const thunder = tags.createTag("thunder");
    tags.attachTagsBatch([{ fileId, tagId: thunder, origin: "manual", confidence: null }]);
    tags.attachTagsBatch([
      { fileId, tagId: thunder, origin: "semantic_ai", confidence: 0.91 },
    ]);
    const row = sqlite
      .prepare("SELECT origin FROM file_tags WHERE file_id = ? AND tag_id = ?")
      .get(fileId, thunder) as { origin: string };
    expect(row.origin).toBe("manual");

    // An automatic first, then a manual, upgrades.
    const rain = tags.createTag("rain");
    tags.attachTagsBatch([{ fileId, tagId: rain, origin: "deterministic", confidence: null }]);
    tags.attachTagsBatch([{ fileId, tagId: rain, origin: "manual", confidence: null }]);
    const upgraded = sqlite
      .prepare("SELECT origin FROM file_tags WHERE file_id = ? AND tag_id = ?")
      .get(fileId, rain) as { origin: string };
    expect(upgraded.origin).toBe("manual");
  });
});
