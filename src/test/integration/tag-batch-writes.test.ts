import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { audioFileRecord, createTestDatabase, type TestDatabase } from "@/test/fixtures";
import { SqliteAudioFileRepository } from "@/lib/database/file-repository";
import { SqliteTagRepository } from "@/lib/database/tag-repository";

// Area: #258/#286. Batch tag writes land in one transaction, stay idempotent
// on a retried job, keep the origin precedence rule, and report what they did.

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

  function row(tagId: string): { origin: string; confidence: number | null } {
    return sqlite
      .prepare(
        "SELECT origin, confidence FROM file_tags WHERE file_id = ? AND tag_id = ?",
      )
      .get(fileId, tagId) as { origin: string; confidence: number | null };
  }

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
    expect(row(thunder).origin).toBe("manual");

    // An automatic first, then a manual, upgrades.
    const rain = tags.createTag("rain");
    tags.attachTagsBatch([{ fileId, tagId: rain, origin: "deterministic", confidence: null }]);
    tags.attachTagsBatch([{ fileId, tagId: rain, origin: "manual", confidence: null }]);
    expect(row(rain).origin).toBe("manual");
  });

  it("reports inserted, upgraded, and ignored writes from precedence", () => {
    const thunder = tags.createTag("thunder");
    // Insert.
    expect(
      tags.attachTagsBatch([{ fileId, tagId: thunder, origin: "deterministic" }]),
    ).toEqual({ inserted: 1, upgraded: 0, ignored: 0 });
    // Same write again: ignored, no change.
    expect(
      tags.attachTagsBatch([{ fileId, tagId: thunder, origin: "deterministic" }]),
    ).toEqual({ inserted: 0, upgraded: 0, ignored: 1 });
    // A weaker semantic write never downgrades a deterministic attachment.
    expect(
      tags.attachTagsBatch([
        { fileId, tagId: thunder, origin: "semantic_ai", confidence: 0.9 },
      ]),
    ).toEqual({ inserted: 0, upgraded: 0, ignored: 1 });
    expect(row(thunder)).toEqual({ origin: "deterministic", confidence: null });
    // A manual write upgrades.
    expect(
      tags.attachTagsBatch([{ fileId, tagId: thunder, origin: "manual" }]),
    ).toEqual({ inserted: 0, upgraded: 1, ignored: 0 });
    expect(row(thunder)).toEqual({ origin: "manual", confidence: null });
  });

  it("refreshes a same-origin semantic confidence but never weakens an origin", () => {
    const rain = tags.createTag("rain");
    expect(
      tags.attachTagsBatch([
        { fileId, tagId: rain, origin: "semantic_ai", confidence: 0.6 },
      ]),
    ).toEqual({ inserted: 1, upgraded: 0, ignored: 0 });
    // A rerun over a new vector refreshes the stored confidence instead of
    // leaving it disagreeing with the vector it came from (#286).
    expect(
      tags.attachTagsBatch([
        { fileId, tagId: rain, origin: "semantic_ai", confidence: 0.91 },
      ]),
    ).toEqual({ inserted: 0, upgraded: 1, ignored: 0 });
    expect(row(rain)).toEqual({ origin: "semantic_ai", confidence: 0.91 });
    // A deterministic write strengthens the origin and clears the confidence.
    expect(
      tags.attachTagsBatch([{ fileId, tagId: rain, origin: "deterministic" }]),
    ).toEqual({ inserted: 0, upgraded: 1, ignored: 0 });
    expect(row(rain)).toEqual({ origin: "deterministic", confidence: null });
  });
});
