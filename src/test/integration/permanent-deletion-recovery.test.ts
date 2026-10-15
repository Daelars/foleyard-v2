import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  audioFileRecord,
  callRoute,
  createScratchLibrary,
  createTestDatabase,
  type ScratchLibrary,
  type TestDatabase,
} from "@/test/fixtures";
import { SqliteAudioFileRepository } from "@/lib/database/file-repository";
import { SqliteDeletionJournal } from "@/lib/database/deletion-journal";

// Area: permanent deletion recovery (#269).
//
// The contract is that the filesystem and the Library index never disagree
// after a permanent delete, no matter where the process stops: the durable
// intent is committed before the unlink, a crash after the unlink is
// reconciled from it, a database failure after the unlink is reported
// instead of silently ignored, and a path that was replaced since it was
// indexed is never unlinked. Every test here injects one of those boundaries.

const state = vi.hoisted(() => ({
  files: null as SqliteAudioFileRepository | null,
  journal: null as SqliteDeletionJournal | null,
  libraryRoots: [] as string[],
  /** Fault injection: the index update after the unlink fails. */
  failMarkRemoved: false,
  /** Fault injection: something replaces the path while the intent lands. */
  onRecord: null as null | (() => void),
}));

vi.mock("@/lib/db", () => ({
  getFilesByIds: (ids: string[]) => state.files!.getFilesByIds(ids),
  getLibraryRoots: () => state.libraryRoots,
  batchMarkRemoved: (paths: string[], removedAt: string, now: string) => {
    if (state.failMarkRemoved) throw new Error("database is locked");
    state.files!.batchMarkRemoved(paths, removedAt, now);
  },
  recordPendingDeletion: (entry: Parameters<SqliteDeletionJournal["record"]>[0]) => {
    state.journal!.record(entry);
    state.onRecord?.();
  },
  listPendingDeletions: () => state.journal!.list(),
  clearPendingDeletions: (paths: string[]) => state.journal!.clear(paths),
}));

import {
  deleteFiles,
  recoverPendingDeletions,
  realDeletionFileSystem,
  INDEX_UPDATE_FAILED,
  type DeletionFileSystem,
} from "@/lib/files/delete-files";
import { DELETE as deleteFilesRoute } from "@/app/api/files/route";

let library: ScratchLibrary;
let sqlite: TestDatabase;
let files: SqliteAudioFileRepository;

function seed(filePath: string) {
  const stats = fs.statSync(filePath);
  files.batchUpsertFiles(
    [
      audioFileRecord({
        path: filePath,
        filename: path.basename(filePath),
        fileSize: stats.size,
        mtimeMs: Math.trunc(stats.mtimeMs),
      }),
    ],
    new Date().toISOString(),
  );
  return files.getFileByPath(filePath)!;
}

/** Journals an intent whose identity is the file's current state. */
function recordIntent(filePath: string, fileId: string) {
  const stats = fs.statSync(filePath);
  state.journal!.record({
    path: filePath,
    fileId,
    fileSize: stats.size,
    mtimeMs: Math.trunc(stats.mtimeMs),
  });
}

function failWith(code: string) {
  return async () => {
    const error = new Error(code) as NodeJS.ErrnoException;
    error.code = code;
    throw error;
  };
}

/** Whether this platform lets the test create a file symlink. */
const fileSymlinksSupported = (() => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "foleyard-symlink-"));
  try {
    const target = path.join(directory, "target");
    const link = path.join(directory, "link");
    fs.writeFileSync(target, "x");
    fs.symlinkSync(target, link, "file");
    return true;
  } catch {
    return false;
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
})();

beforeEach(() => {
  sqlite = createTestDatabase();
  files = new SqliteAudioFileRepository(sqlite);
  state.files = files;
  state.journal = new SqliteDeletionJournal(sqlite);
  state.failMarkRemoved = false;
  state.onRecord = null;
  library = createScratchLibrary("foleyard-delete-recovery-");
  state.libraryRoots = [library.directory("library")];
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  library.dispose();
  sqlite.close();
  state.libraryRoots = [];
  vi.restoreAllMocks();
});

describe("permanent deletion recovery", () => {
  it("commits the durable intent before the unlink and clears it with the index", async () => {
    const file = library.writeFile("library/hit.wav", "audio");
    const record = seed(file);
    let journalAtUnlink: string[] = [];

    const seam: DeletionFileSystem = {
      lstat: (candidate) => realDeletionFileSystem.lstat(candidate),
      unlink: async (candidate) => {
        // The intent must already be durable when the first irreversible
        // step runs, otherwise a crash here is unrecoverable.
        journalAtUnlink = state.journal!.list().map((entry) => entry.path);
        await realDeletionFileSystem.unlink(candidate);
      },
    };

    const result = await deleteFiles([record.id], true, { fileSystem: seam });

    expect(result.removed).toEqual([record.id]);
    expect(result.failed).toEqual([]);
    expect(journalAtUnlink).toEqual([file]);
    expect(state.journal!.list(), "the intent goes away once the index agrees").toEqual([]);
    expect(fs.existsSync(file)).toBe(false);
    expect(files.getFileById(record.id)?.removedAt).not.toBeNull();
  });

  it("reports a database failure after the unlink instead of silently leaving the row active", async () => {
    const file = library.writeFile("library/hit.wav", "audio");
    const record = seed(file);
    state.failMarkRemoved = true;

    const response = await callRoute<{
      removed: string[];
      failed: Array<{ id: string; error: string }>;
    }>(deleteFilesRoute, {
      method: "DELETE",
      url: "http://localhost/api/files",
      body: { fileIds: [record.id], permanent: true },
    });

    expect(response.status).toBe(200);
    expect(
      response.body.removed,
      "a deletion the index never stored is not reported as removed",
    ).toEqual([]);
    expect(response.body.failed).toEqual([{ id: record.id, error: INDEX_UPDATE_FAILED }]);
    expect(fs.existsSync(file), "the unlink did happen").toBe(false);
    expect(
      files.getFileById(record.id)?.removedAt,
      "the interrupted state: the row is still active",
    ).toBeNull();
    expect(
      state.journal!.list().map((entry) => entry.path),
      "the intent survives the failure",
    ).toEqual([file]);

    // The next scan reconciles it: the path is gone, so the index catches up.
    state.failMarkRemoved = false;
    const recovery = await recoverPendingDeletions();

    expect(recovery).toEqual({ reconciled: 1, abandoned: 0, superseded: 0, pending: 0 });
    expect(files.getFileById(record.id)?.removedAt).not.toBeNull();
    expect(state.journal!.list()).toEqual([]);
  });

  it("never deletes from recovery: an intent whose file is still there is abandoned", async () => {
    const file = library.writeFile("library/hit.wav", "audio");
    const record = seed(file);
    recordIntent(file, record.id);

    const recovery = await recoverPendingDeletions();

    expect(recovery).toEqual({ reconciled: 0, abandoned: 1, superseded: 0, pending: 0 });
    expect(fs.existsSync(file), "recovery must never unlink").toBe(true);
    expect(files.getFileById(record.id)?.removedAt).toBeNull();
    expect(state.journal!.list()).toEqual([]);
  });

  it("abandons an intent whose path a different file now occupies", async () => {
    const file = library.writeFile("library/hit.wav", "audio");
    const record = seed(file);
    recordIntent(file, record.id);
    fs.writeFileSync(file, "a different file entirely");

    const recovery = await recoverPendingDeletions();

    expect(recovery).toEqual({ reconciled: 0, abandoned: 0, superseded: 1, pending: 0 });
    expect(fs.readFileSync(file, "utf8"), "the replacement is untouched").toBe(
      "a different file entirely",
    );
    expect(state.journal!.list()).toEqual([]);
  });

  it("retries an intent it cannot inspect instead of guessing", async () => {
    const file = library.writeFile("library/hit.wav", "audio");
    const record = seed(file);
    recordIntent(file, record.id);

    const seam: DeletionFileSystem = {
      lstat: failWith("EACCES"),
      unlink: () => Promise.resolve(),
    };
    const recovery = await recoverPendingDeletions({ fileSystem: seam });

    expect(recovery).toEqual({ reconciled: 0, abandoned: 0, superseded: 0, pending: 1 });
    expect(state.journal!.list()).toHaveLength(1);
    expect(fs.existsSync(file)).toBe(true);
  });

  it("refuses a path that was replaced since it was indexed", async () => {
    const file = library.writeFile("library/hit.wav", "audio");
    const record = seed(file);
    fs.writeFileSync(file, "a much longer replacement file");

    const result = await deleteFiles([record.id], true);

    expect(result.removed).toEqual([]);
    expect(result.failed.map((entry) => entry.id)).toEqual([record.id]);
    expect(result.failed[0].error).toMatch(/replaced/i);
    expect(fs.existsSync(file), "the replacement survives").toBe(true);
    expect(state.journal!.list(), "a refused delete leaves no intent").toEqual([]);
    expect(files.getFileById(record.id)?.removedAt).toBeNull();
  });

  it("refuses a same-size replacement whose modification time moved", async () => {
    const file = library.writeFile("library/hit.wav", "audio");
    const record = seed(file);
    const later = new Date(Date.now() + 60_000);
    fs.utimesSync(file, later, later);

    const result = await deleteFiles([record.id], true);

    expect(result.removed).toEqual([]);
    expect(result.failed.map((entry) => entry.id)).toEqual([record.id]);
    expect(fs.existsSync(file)).toBe(true);
    expect(state.journal!.list()).toEqual([]);
  });

  it("re-checks identity after journalling and never redirects a replacement", async () => {
    const file = library.writeFile("library/hit.wav", "audio");
    const record = seed(file);
    // The swap happens in the window between validation and the unlink.
    state.onRecord = () => fs.writeFileSync(file, "a much longer replacement file");

    const result = await deleteFiles([record.id], true);

    expect(result.removed).toEqual([]);
    expect(result.failed[0].error).toMatch(/changed between validation and deletion/i);
    expect(fs.existsSync(file), "the replacement survives").toBe(true);
    expect(
      state.journal!.list(),
      "a delete refused before the unlink leaves no intent",
    ).toEqual([]);
    expect(files.getFileById(record.id)?.removedAt).toBeNull();
  });

  it.runIf(fileSymlinksSupported)(
    "refuses a path that is now a symbolic link instead of unlinking through it",
    async () => {
      const file = library.writeFile("library/hit.wav", "audio");
      const other = library.writeFile("library/other.wav", "other");
      const record = seed(file);
      fs.rmSync(file);
      fs.symlinkSync(other, file, "file");

      const result = await deleteFiles([record.id], true);

      expect(result.removed).toEqual([]);
      expect(result.failed[0].error).toMatch(/symbolic link/i);
      expect(
        fs.readFileSync(other, "utf8"),
        "a link must not redirect the delete to its target",
      ).toBe("other");
      expect(state.journal!.list()).toEqual([]);
    },
  );

  it("clears the intent and keeps the file when the unlink itself fails", async () => {
    const file = library.writeFile("library/hit.wav", "audio");
    const record = seed(file);
    const seam: DeletionFileSystem = {
      lstat: (candidate) => realDeletionFileSystem.lstat(candidate),
      unlink: failWith("EPERM"),
    };

    const result = await deleteFiles([record.id], true, { fileSystem: seam });

    expect(result.removed).toEqual([]);
    expect(result.failed.map((entry) => entry.id)).toEqual([record.id]);
    expect(fs.existsSync(file)).toBe(true);
    expect(state.journal!.list(), "a failed unlink leaves no intent behind").toEqual([]);
    expect(files.getFileById(record.id)?.removedAt).toBeNull();
  });

  it("treats an already-missing file as deleted and records it", async () => {
    const file = library.writeFile("library/hit.wav", "audio");
    const record = seed(file);
    const seam: DeletionFileSystem = {
      lstat: (candidate) => realDeletionFileSystem.lstat(candidate),
      unlink: failWith("ENOENT"),
    };

    const result = await deleteFiles([record.id], true, { fileSystem: seam });

    expect(result.removed).toEqual([record.id]);
    expect(state.journal!.list()).toEqual([]);
    expect(files.getFileById(record.id)?.removedAt).not.toBeNull();
  });

  it("keeps soft removal off the filesystem and out of the journal", async () => {
    const file = library.writeFile("library/hit.wav", "audio");
    const record = seed(file);

    const result = await deleteFiles([record.id], false);

    expect(result.removed).toEqual([record.id]);
    expect(fs.existsSync(file)).toBe(true);
    expect(state.journal!.list()).toEqual([]);
    expect(files.getFileById(record.id)?.removedAt).not.toBeNull();
  });

  it("refuses a file outside the configured Library roots without journalling", async () => {
    const outside = library.writeFile("private/hit.wav", "audio");
    const record = seed(outside);

    const result = await deleteFiles([record.id], true);

    expect(result.removed).toEqual([]);
    expect(result.failed[0].error).toMatch(/outside the configured Library roots/i);
    expect(fs.existsSync(outside)).toBe(true);
    expect(state.journal!.list()).toEqual([]);
  });
});
