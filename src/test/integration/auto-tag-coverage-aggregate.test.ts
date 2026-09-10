import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { audioFileRecord, createTestDatabase, type TestDatabase } from "@/test/fixtures";
import { SqliteAudioFileRepository } from "@/lib/database/file-repository";
import { SqliteTagRepository } from "@/lib/database/tag-repository";

// Area: #257. The SQL coverage aggregate and member page match the values the
// auto-tag handler's single-pass JavaScript reduction produced.

describe("auto-tag coverage aggregate", () => {
  let sqlite: TestDatabase;
  let files: SqliteAudioFileRepository;
  let tags: SqliteTagRepository;

  beforeEach(() => {
    sqlite = createTestDatabase();
    files = new SqliteAudioFileRepository(sqlite);
    tags = new SqliteTagRepository(sqlite);
    files.batchUpsertFiles(
      [
        audioFileRecord({ path: "/lib/a.wav", filename: "a.wav" }),
        audioFileRecord({ path: "/lib/b.wav", filename: "b.wav" }),
        audioFileRecord({ path: "/lib/c.wav", filename: "c.wav" }),
        audioFileRecord({
          path: "/lib/gone.wav",
          filename: "gone.wav",
          removedAt: "2026-01-01T00:00:00.000Z",
        }),
      ],
      new Date().toISOString(),
    );
    const a = files.getFileByPath("/lib/a.wav")!;
    const b = files.getFileByPath("/lib/b.wav")!;
    const gone = files.getFileByPath("/lib/gone.wav")!;
    const thunder = tags.createTag("thunder");
    const rain = tags.createTag("rain");
    tags.attachTagToFileWithOrigin(a.id, thunder, "manual");
    tags.attachTagToFileWithOrigin(a.id, rain, "deterministic");
    tags.attachTagToFileWithOrigin(b.id, thunder, "deterministic");
    tags.attachTagToFileWithOrigin(gone.id, thunder, "semantic_ai", 0.9);
  });

  afterEach(() => {
    sqlite.close();
  });

  /** The handler fallback's reduction, over the same fixture. */
  function jsAggregate() {
    const active = files.getFiles({ limit: 100, showRemoved: false });
    const attachments = tags.getAttachmentsWithTagsForFiles(active.map((file) => file.id));
    const byFile = new Map<string, typeof attachments>();
    for (const attachment of attachments) {
      const list = byFile.get(attachment.fileId) ?? [];
      list.push(attachment);
      byFile.set(attachment.fileId, list);
    }
    const counts: Record<string, number> = {};
    const origins = { manual: 0, deterministic: 0, semantic_ai: 0 };
    let tagged = 0;
    for (const file of active) {
      const fileAttachments = byFile.get(file.id) ?? [];
      if (fileAttachments.length > 0) tagged += 1;
      const seen = new Set<string>();
      for (const attachment of fileAttachments) {
        counts[attachment.tagName] = (counts[attachment.tagName] ?? 0) + 1;
        seen.add(attachment.origin ?? "manual");
      }
      for (const origin of seen) origins[origin as keyof typeof origins] += 1;
    }
    return {
      total: active.length,
      tagged,
      tags: counts,
      origins,
      allTags: tags.getAllTags().map((tag) => tag.name),
    };
  }

  it("matches the handler's single-pass aggregate", () => {
    expect(tags.coverageAggregate()).toEqual(jsAggregate());
  });

  it("pages members by tag and origin with the full match count", () => {
    const byTag = tags.coverageMemberPage({ tag: "thunder", skip: 0, limit: 1 });
    expect(byTag.matched).toBe(2); // removed file does not match
    expect(byTag.members).toHaveLength(1);
    expect(byTag.members[0]!.filename).toBe("a.wav");
    expect(byTag.members[0]!.tags.map((tag) => tag.name).sort()).toEqual([
      "rain",
      "thunder",
    ]);

    const second = tags.coverageMemberPage({ tag: "thunder", skip: 1, limit: 1 });
    expect(second.members.map((member) => member.filename)).toEqual(["b.wav"]);

    const deterministic = tags.coverageMemberPage({
      origin: "deterministic",
      skip: 0,
      limit: 10,
    });
    expect(deterministic.matched).toBe(2);
    expect(deterministic.members.map((member) => member.filename)).toEqual(["a.wav", "b.wav"]);
    expect(
      deterministic.members.every((member) =>
        member.tags.some((tag) => tag.origin === "deterministic"),
      ),
    ).toBe(true);

    const all = tags.coverageMemberPage({ skip: 0, limit: 10 });
    expect(all.matched).toBe(3);
  });

  it("reads a member page with a bounded number of queries", () => {
    const page = tags.coverageMemberPage({ origin: "deterministic", skip: 0, limit: 1 });
    expect(page.members).toHaveLength(1);
    // The page itself is two grouped reads (count + page) plus one bounded
    // attachment read; no per-file queries.
    const plan = sqlite
      .prepare(
        "EXPLAIN QUERY PLAN SELECT f.id, f.filename FROM files f JOIN file_tags ft ON ft.file_id = f.id WHERE f.removed_at IS NULL AND ft.origin = 'deterministic' GROUP BY f.id ORDER BY f.filename, f.id LIMIT 1 OFFSET 0",
      )
      .all() as Array<{ detail: string }>;
    const details = plan.map((row) => row.detail).join(" | ");
    expect(details).toContain("idx_file_tags_origin");
    expect(details).not.toContain("SCAN files");
  });
});
