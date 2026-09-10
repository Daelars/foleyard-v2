import Database from "better-sqlite3";
import { describe, expect, it, vi } from "vitest";

const getFilesMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db", () => ({
  getFileById: () => null,
  getFilesByIds: () => [],
  getFiles: getFilesMock,
  getAllCollections: () => [],
}));

import { initializeDatabaseSchema } from "@/lib/database/migrations";
import { SqliteAudioFileRepository } from "@/lib/database/file-repository";
import { createV2LibraryPorts } from "@/lib/extensions-v2/library-ports";

// Area: #228. Extension library paging must read active files only so the
// partial idx_files_active_filename_id index serves ORDER BY filename, id
// instead of a full scan plus temp B-tree.

describe("v2 library port paging", () => {
  it("asks the repository for active files only, with one probe row", () => {
    getFilesMock.mockReturnValue([]);

    createV2LibraryPorts().listPage(null, 500);

    expect(getFilesMock).toHaveBeenCalledWith({
      limit: 501,
      offset: 0,
      showRemoved: false,
      sortKey: "filename",
      sortDir: "asc",
    });
  });

  it("walks every active row exactly once through opaque keyset cursors (#256)", () => {
    const sqlite = new Database(":memory:");
    initializeDatabaseSchema(sqlite);
    const repository = new SqliteAudioFileRepository(sqlite);
    const insert = sqlite.prepare(
      "INSERT INTO files(id,path,filename,library_root,format,duration,mtime_ms,removed_at) VALUES(?,?,?,?,?,?,?,?)",
    );
    sqlite.transaction(() => {
      for (let index = 0; index < 2500; index += 1) {
        insert.run(
          `f${String(index).padStart(5, "0")}`,
          `/lib/${index}.wav`,
          `clip-${String((index * 7919) % 2500).padStart(5, "0")}.wav`,
          "/lib",
          "wav",
          index % 300,
          1,
          null,
        );
      }
    })();
    getFilesMock.mockImplementation((options) => repository.getFiles(options));

    const port = createV2LibraryPorts();
    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const page = port.listPage(cursor, 500);
      expect(page.files.length).toBeLessThanOrEqual(500);
      seen.push(...page.files.map((file) => file.id));
      cursor = page.nextCursor;
      pages += 1;
      expect(pages).toBeLessThan(10);
    } while (cursor);

    expect(pages).toBe(5);
    expect(seen).toHaveLength(2500);
    expect(new Set(seen).size).toBe(2500);
    sqlite.close();
  });
});

describe("active paging query plan", () => {
  it("uses the active-files index for a full-library page", () => {
    const sqlite = new Database(":memory:");
    initializeDatabaseSchema(sqlite);
    const insert = sqlite.prepare(
      "INSERT INTO files(id,path,filename,library_root,format,duration,mtime_ms,removed_at) VALUES(?,?,?,?,?,?,?,?)",
    );
    sqlite.transaction(() => {
      for (let i = 0; i < 50_000; i += 1) {
        const removed = i % 25 === 0 ? "2026-01-01T00:00:00.000Z" : null;
        insert.run(
          `file-${String(i).padStart(8, "0")}`,
          `/fixture/${i}.wav`,
          `clip-${String((i * 7919) % 50_000).padStart(8, "0")}.wav`,
          "/fixture",
          "wav",
          i % 300,
          1_700_000_000_000,
          removed,
        );
      }
    })();
    sqlite.exec("ANALYZE;");

    const activePlan = sqlite
      .prepare(
        "EXPLAIN QUERY PLAN SELECT id,filename FROM files WHERE removed_at IS NULL ORDER BY filename ASC, id ASC LIMIT 500 OFFSET 0",
      )
      .all() as Array<{ detail: string }>;
    const details = activePlan.map((row) => row.detail).join(" | ");

    expect(details).toContain("idx_files_active_filename_id");
    expect(details).not.toContain("TEMP B-TREE");

    const repository = new SqliteAudioFileRepository(sqlite);
    expect(repository.getFiles({ limit: 5, offset: 0, showRemoved: false })).toHaveLength(5);
    expect(
      repository
        .getFiles({ limit: 5, offset: 0, showRemoved: false })
        .every((file) => file.removedAt === null),
    ).toBe(true);

    sqlite.close();
    // 50k inserts also populate the trigram FTS index (#251), so the fixture
    // build is slower than the plan checks it serves.
  }, 60_000);
});
