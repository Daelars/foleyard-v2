import path from "node:path";

import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  audioFileRecord,
  createScratchLibrary,
  createTestDatabase,
  type ScratchLibrary,
  type TestDatabase,
} from "@/test/fixtures";
import { SqliteAudioFileRepository } from "@/lib/database/file-repository";
import { SqliteSettingsRepository } from "@/lib/database/settings-repository";
import { SqliteLibraryRootService } from "@/lib/database/root-detachment";
import { initializeDatabaseSchema } from "@/lib/database/migrations";
import { ScanRunner } from "@/lib/scanner/scan-runner";
import { RealFileSystemSeam } from "@/lib/scanner/filesystem";

// Area: durable exclusions (#275). A user or Folder Janitor removal is an
// exclusion, not a transient "missing" flag: once a path is removed it stays
// out of the Library through later scans, metadata refreshes, restarts and a
// root detach/re-add. Only an explicit restore clears it. Getting this wrong
// silently re-admits files the user deliberately removed.

const NOW = () => new Date().toISOString();

const METADATA = {
  filename: "hit.wav",
  format: "wav",
  codec: "pcm",
  duration: 1.5,
  sampleRate: 44100,
  bitDepth: 16,
  channels: 2,
  fileSize: null as number | null,
};

/** A ScanRunner over the real filesystem and the given SQLite handle. */
function makeRunner(sqlite: TestDatabase, settings: SqliteSettingsRepository) {
  const files = new SqliteAudioFileRepository(sqlite);
  const runner = new ScanRunner({
    fileRepo: files,
    settingsRepo: settings,
    getLibraryRoots: () => settings.getLibraryRoots(),
    fs: new RealFileSystemSeam(),
    metadataExtractor: {
      extract: async (_filePath, options) => ({
        ...METADATA,
        fileSize: options?.fileSize ?? null,
      }),
    },
  });
  return { files, runner };
}

async function runScanToIdle(runner: ScanRunner, timeoutMs = 30000) {
  const started = runner.startScan();
  expect(started.started, "the scan starts").toBe(true);
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (!runner.getStatus().running) {
      return runner.getStatus();
    }
    if (Date.now() > deadline) {
      throw new Error("scan did not finish in time");
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

describe("durable exclusions", () => {
  let scratch: ScratchLibrary;

  beforeEach(() => {
    scratch = createScratchLibrary("foleyard-durable-");
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    scratch.dispose();
    vi.restoreAllMocks();
  });

  it("does not re-admit an excluded file on the next real scan", async () => {
    const sqlite = createTestDatabase();
    try {
      const settings = new SqliteSettingsRepository(sqlite);
      const { files, runner } = makeRunner(sqlite, settings);
      const kick = scratch.writeFile("kick.wav");
      const hat = scratch.writeFile("hat.wav");
      settings.setLibraryRoots([scratch.root]);

      await runScanToIdle(runner);
      expect(files.getFiles()).toHaveLength(2);

      // The user excludes kick; the file stays on disk.
      files.batchMarkRemoved([kick], NOW(), NOW());
      expect(files.getFiles().map((file) => file.path)).toEqual([hat]);

      // A rescan rediscovers it. Removal is the exclusion, so re-seeing the
      // path must not put it back in the Library.
      await runScanToIdle(runner);

      expect(files.getFileByPath(kick)?.removedAt).not.toBeNull();
      expect(
        files.getFiles().map((file) => file.path),
        "an exclusion came back on the next scan",
      ).toEqual([hat]);
      expect(files.getFiles({ showRemoved: true })).toHaveLength(2);
    } finally {
      sqlite.close();
    }
  });

  it("keeps an exclusion through a metadata refresh and an explicit restore clears it", () => {
    const sqlite = createTestDatabase();
    try {
      const files = new SqliteAudioFileRepository(sqlite);
      const record = audioFileRecord({ path: "/lib/gone.wav" });
      files.batchUpsertFiles([record], NOW());
      files.batchMarkRemoved([record.path], NOW(), NOW());

      // A metadata refresh only rewrites extractable fields.
      files.batchUpdateFileMetadata(
        [{ path: record.path, codec: "aac", duration: 9, sampleRate: 48000, bitDepth: 24, channels: 1, fileSize: 42 }],
        NOW(),
      );
      expect(files.getFileByPath(record.path)?.removedAt).not.toBeNull();
      expect(files.getFiles()).toHaveLength(0);

      // The explicit restore is the one action that re-admits it.
      files.restoreFiles([record.path], NOW());
      const restored = files.getFileByPath(record.path);
      expect(restored?.removedAt).toBeNull();
      expect(restored?.duration).toBe(9);
      expect(files.getFiles()).toHaveLength(1);
    } finally {
      sqlite.close();
    }
  });

  it("survives a restart (close and reopen the database file)", () => {
    const dbPath = path.join(scratch.root, "library.sqlite");
    let sqlite = new Database(dbPath);
    try {
      initializeDatabaseSchema(sqlite);
      let files = new SqliteAudioFileRepository(sqlite);
      const record = audioFileRecord({ path: "/lib/gone.wav" });
      files.batchUpsertFiles([record], NOW());
      files.batchMarkRemoved([record.path], NOW(), NOW());
      sqlite.close();

      sqlite = new Database(dbPath);
      initializeDatabaseSchema(sqlite);
      files = new SqliteAudioFileRepository(sqlite);
      expect(files.getFileByPath(record.path)?.removedAt).not.toBeNull();
      expect(files.getFiles()).toHaveLength(0);
    } finally {
      sqlite.close();
    }
  });

  it("keeps an exclusion when its root is detached and re-added (#271)", () => {
    const sqlite = createTestDatabase();
    try {
      const settings = new SqliteSettingsRepository(sqlite);
      const files = new SqliteAudioFileRepository(sqlite);
      const roots = new SqliteLibraryRootService(sqlite);
      settings.setLibraryRoots(["/lib"]);

      const record = { ...audioFileRecord({ path: "/lib/gone.wav" }), libraryRoot: "/lib" };
      files.batchUpsertFiles([record], NOW());
      files.batchMarkRemoved([record.path], NOW(), NOW());

      // Removing the root detaches the row; re-adding it reattaches the row
      // but must not clear the user's exclusion.
      roots.detachRoot("/lib");
      expect(files.getFileByPath(record.path)?.detachedAt).not.toBeNull();

      roots.reattachRoot("/lib");
      const reattached = files.getFileByPath(record.path);
      expect(reattached?.detachedAt).toBeNull();
      expect(reattached?.removedAt).not.toBeNull();
      expect(files.getFiles()).toHaveLength(0);
    } finally {
      sqlite.close();
    }
  });
});
