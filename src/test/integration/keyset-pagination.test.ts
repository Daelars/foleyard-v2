import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { callRoute, createTestDatabase, type TestDatabase } from "@/test/fixtures";
import { SqliteAudioFileRepository } from "@/lib/database/file-repository";

// Area: #256. File-list paging walks every row exactly once through opaque
// keyset cursors, hasMore is exact at boundaries, and the offset surface
// stays compatible for existing callers.

const state = vi.hoisted(() => ({
  files: null as SqliteAudioFileRepository | null,
}));

vi.mock("@/lib/db", () => ({
  getFiles: (...args: never[]) => state.files!.getFiles(...args),
  getFileCount: (...args: never[]) => state.files!.getFileCount(...args),
  getTagsForFiles: () => new Map(),
  getAttachmentsForFiles: () => new Map(),
  getFileById: () => null,
  getFilesByIds: () => [],
}));

import { GET } from "@/app/api/files/route";

type FilePage = {
  files: Array<{ id: string; filename: string; duration: number | null }>;
  hasMore: boolean;
  nextCursor: string | null;
  offset: number;
};

describe("keyset file pagination", () => {
  let sqlite: TestDatabase;
  let files: SqliteAudioFileRepository;

  beforeEach(() => {
    sqlite = createTestDatabase();
    files = new SqliteAudioFileRepository(sqlite);
    state.files = files;
    const insert = sqlite.prepare(
      `INSERT INTO files (id, path, filename, library_root, format, duration, file_size, mtime_ms, removed_at)
       VALUES (?, ?, ?, '/lib', 'wav', ?, 100, 1, NULL)`,
    );
    // 14 rows: shuffled filenames, some null durations.
    for (let index = 0; index < 14; index += 1) {
      const duration = index % 4 === 0 ? null : 14 - index;
      insert.run(
        `f${String(index).padStart(2, "0")}`,
        `/lib/${index}.wav`,
        `clip-${String((index * 5) % 14).padStart(2, "0")}.wav`,
        duration,
      );
    }
  });

  afterEach(() => {
    sqlite.close();
  });

  async function getPage(query: string): Promise<FilePage> {
    const response = await callRoute<FilePage>(GET, {
      method: "GET",
      url: `http://localhost/api/files?${query}`,
    });
    expect(response.status).toBe(200);
    return response.body;
  }

  async function walk(sortKey: "filename" | "duration", sortDir: "asc" | "desc") {
    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const page = await getPage(
        `limit=5&sortKey=${sortKey}&sortDir=${sortDir}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
      );
      seen.push(...page.files.map((file) => file.id));
      cursor = page.nextCursor;
      pages += 1;
      expect(pages).toBeLessThan(10);
    } while (cursor);
    return { seen, pages };
  }

  it("walks every row exactly once in filename order", async () => {
    const expected = files
      .getFiles({ limit: 100, sortKey: "filename", sortDir: "asc" })
      .map((file) => file.id);
    const { seen, pages } = await walk("filename", "asc");
    expect(seen).toEqual(expected);
    expect(pages).toBe(3);
  });

  it("walks every row exactly once in duration order, both directions", async () => {
    for (const dir of ["asc", "desc"] as const) {
      const expected = files
        .getFiles({ limit: 100, sortKey: "duration", sortDir: dir })
        .map((file) => file.id);
      const { seen } = await walk("duration", dir);
      expect(seen, `duration ${dir}`).toEqual(expected);
    }
  });

  it("hasMore is exact when a page lands on the boundary", async () => {
    const first = await getPage("limit=7&sortKey=filename&sortDir=asc");
    expect(first.files).toHaveLength(7);
    expect(first.hasMore).toBe(true);
    expect(typeof first.nextCursor).toBe("string");

    const second = await getPage(
      `limit=7&sortKey=filename&sortDir=asc&cursor=${encodeURIComponent(first.nextCursor!)}`,
    );
    expect(second.files).toHaveLength(7);
    expect(second.hasMore).toBe(false);
    expect(second.nextCursor).toBeNull();
  });

  it("keeps the offset surface working for existing callers", async () => {
    const all = files.getFiles({ limit: 100, sortKey: "filename", sortDir: "asc" });
    const offsetPage = await getPage("limit=5&offset=5&sortKey=filename&sortDir=asc");
    expect(offsetPage.offset).toBe(5);
    expect(offsetPage.files.map((file) => file.id)).toEqual(
      all.slice(5, 10).map((file) => file.id),
    );
  });

  it("rejects a cursor from a different ordering", async () => {
    const page = await getPage("limit=5&sortKey=filename&sortDir=asc");
    const response = await callRoute<{ error: string }>(GET, {
      method: "GET",
      url: `http://localhost/api/files?limit=5&sortKey=duration&sortDir=asc&cursor=${encodeURIComponent(page.nextCursor!)}`,
    });
    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/cursor/i);
  });
});
