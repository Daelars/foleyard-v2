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
  it("asks the repository for active files only", () => {
    getFilesMock.mockReturnValue([]);

    createV2LibraryPorts().listPage(null, 500);

    expect(getFilesMock).toHaveBeenCalledWith({
      limit: 500,
      offset: 0,
      showRemoved: false,
    });
  });

  it("keeps cursors in active-row space", () => {
    getFilesMock.mockReturnValue([{ id: "a" }, { id: "b" }]);

    const page = createV2LibraryPorts().listPage("10", 2);

    expect(getFilesMock).toHaveBeenCalledWith({
      limit: 2,
      offset: 10,
      showRemoved: false,
    });
    expect(page.nextCursor).toBe("12");
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
  });
});
