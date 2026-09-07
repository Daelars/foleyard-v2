import { rmSync, utimesSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createScratchLibrary,
  createTestDatabase,
  type TestDatabase,
} from "@/test/fixtures";
import { SqliteAudioFileRepository } from "@/lib/database/file-repository";
import { SqliteTagRepository } from "@/lib/database/tag-repository";
import { SqliteCollectionRepository } from "@/lib/database/collection-repository";
import { SqliteSettingsRepository } from "@/lib/database/settings-repository";
import { startScan, getScanStatus } from "@/lib/scanner/run-scan";

// Area: scanner (#139). Replaces two files and 17 tests that constructed
// ScanRunner directly with injected seams with 6 integration tests driven
// through startScan — what the API route actually calls — against real temp
// directories and a real database.

type MetadataResult = {
  filename: string;
  format: string | null;
  codec: string | null;
  duration: number | null;
  sampleRate: number | null;
  bitDepth: number | null;
  channels: number | null;
  fileSize: number | null;
};

const FULL_METADATA: MetadataResult = {
  filename: "hit.wav",
  format: "wav",
  codec: "pcm",
  duration: 120,
  sampleRate: 44100,
  bitDepth: 16,
  channels: 2,
  fileSize: 1024,
};

const state = vi.hoisted(() => ({
  files: null as SqliteAudioFileRepository | null,
  tags: null as SqliteTagRepository | null,
  collections: null as SqliteCollectionRepository | null,
  settings: null as SqliteSettingsRepository | null,
  extractor: null as null | ((
    filePath: string,
    options?: { fileSize?: number; filename?: string; format?: string | null; fullParse?: boolean },
  ) => Promise<MetadataResult>),
}));

vi.mock("@/lib/db", () => ({
  getFiles: (...args: never[]) => state.files!.getFiles(...args),
  getFileCount: (...args: never[]) => state.files!.getFileCount(...args),
  getAllFilesIncludingRemoved: () => state.files!.getAllFilesIncludingRemoved(),
  getFileById: (id: string) => state.files!.getFileById(id),
  getFileByPath: (path: string) => state.files!.getFileByPath(path),
  getFilesByPaths: (paths: string[]) => state.files!.getFilesByPaths(paths),
  upsertFile: (record: never) => state.files!.upsertFile(record),
  batchTouchFiles: (entries: never, now: string) => state.files!.batchTouchFiles(entries, now),
  batchUpsertFiles: (records: never, now: string) => state.files!.batchUpsertFiles(records, now),
  batchUpdateFileMetadata: (records: never, now: string) =>
    state.files!.batchUpdateFileMetadata(records, now),
  batchMarkRemoved: (paths: string[], removedAt: string, now: string) =>
    state.files!.batchMarkRemoved(paths, removedAt, now),
  reconcileMovedFiles: () => state.files!.reconcileMovedFiles(),
  toggleFavorite: (id: string) => state.files!.toggleFavorite(id),
  getLibraryRoot: () => state.settings!.getLibraryRoot(),
  getLibraryRoots: () => state.settings!.getLibraryRoots(),
  getLibraryStats: () => state.settings!.getLibraryStats(),
  setLibraryRoots: (roots: string[]) => state.settings!.setLibraryRoots(roots),
}));

vi.mock("@/lib/metadata", () => ({
  extractMetadata: (
    filePath: string,
    options?: { fileSize?: number; filename?: string; format?: string | null; fullParse?: boolean },
  ) => state.extractor!(filePath, options),
}));

let sqlite: TestDatabase;
let files: SqliteAudioFileRepository;
let settings: SqliteSettingsRepository;

function wireDatabase() {
  sqlite = createTestDatabase();
  files = new SqliteAudioFileRepository(sqlite);
  state.files = files;
  state.tags = new SqliteTagRepository(sqlite);
  state.collections = new SqliteCollectionRepository(sqlite);
  settings = new SqliteSettingsRepository(sqlite);
  state.settings = settings;
}

async function runScanToIdle(timeoutMs = 30000) {
  const started = startScan();
  expect(started.started, "the scan starts").toBe(true);
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (!getScanStatus().running) {
      return getScanStatus();
    }
    if (Date.now() > deadline) {
      throw new Error("scan did not finish in time");
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

beforeEach(() => {
  wireDatabase();
  // The fake reports the real on-disk size: the queue writes fileSize back to
  // the row, and a lying size would mark every file changed on every scan.
  state.extractor = async (_path, options) => ({
    ...FULL_METADATA,
    fileSize: options?.fileSize ?? 1024,
  });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  sqlite.close();
  vi.restoreAllMocks();
});

describe("scanner", () => {
  it("indexes a full scan through the real entrypoint, and refuses to start with no roots", async () => {
    expect(
      startScan(),
      "no library roots means no scan",
    ).toMatchObject({ started: false, reason: "missing-root" });

    const scratch = createScratchLibrary("foleyard-scan-full-");
    try {
      const kick = scratch.writeFile("kick.wav");
      const snare = scratch.writeFile("sub/snare.wav");
      settings.setLibraryRoots([scratch.root]);

      const status = await runScanToIdle();
      expect(status.phase).toBe("complete");
      expect(status.added).toBe(2);

      const rows = files.getFiles({ limit: 10 });
      expect(rows.map((row) => row.path).sort()).toEqual([kick, snare].sort());
      expect(rows.map((row) => row.duration)).toEqual([120, 120]);
    } finally {
      scratch.dispose();
    }
  });

  it("skips unchanged files on a second scan and detects mtime changes", async () => {
    const scratch = createScratchLibrary("foleyard-scan-rescan-");
    try {
      const kick = scratch.writeFile("kick.wav");
      scratch.writeFile("hat.wav");
      settings.setLibraryRoots([scratch.root]);

      await runScanToIdle();
      const second = await runScanToIdle();
      expect(second.added).toBe(0);
      expect(second.skippedUnchanged).toBe(2);

      // A touched file is re-indexed; the untouched one is skipped again.
      const later = new Date(Date.now() + 5000);
      utimesSync(kick, later, later);
      const third = await runScanToIdle();
      expect(third.updated).toBe(1);
      expect(third.skippedUnchanged).toBe(1);
    } finally {
      scratch.dispose();
    }
  });

  it("marks missing files removed without touching the survivors", async () => {
    const scratch = createScratchLibrary("foleyard-scan-removed-");
    try {
      const kick = scratch.writeFile("kick.wav");
      scratch.writeFile("hat.wav");
      settings.setLibraryRoots([scratch.root]);

      await runScanToIdle();
      rmSync(kick);
      const status = await runScanToIdle();

      expect(status.removed).toBe(1);
      expect(files.getFileByPath(kick)?.removedAt).not.toBeNull();
      expect(files.getFileCount()).toBe(1);
      expect(files.getFileCount({ showRemoved: true })).toBe(2);
    } finally {
      scratch.dispose();
    }
  });

  it.fails("resolves parent/child root ownership deterministically regardless of order (I03)", async () => {
    const scratch = createScratchLibrary("foleyard-scan-roots-");
    try {
      const deep = scratch.writeFile("sub/deep.wav");
      scratch.writeFile("top.wav");

      settings.setLibraryRoots([scratch.root, `${scratch.root}/sub`]);
      await runScanToIdle();
      const firstOwner = files.getFileByPath(deep)?.libraryRoot;

      // Same files, same roots, opposite order: a fresh index must agree.
      sqlite.close();
      wireDatabase();
      settings.setLibraryRoots([`${scratch.root}/sub`, scratch.root]);
      await runScanToIdle();
      const secondOwner = files.getFileByPath(deep)?.libraryRoot;

      expect(
        secondOwner,
        `ownership must not depend on root order (got ${firstOwner} then ${secondOwner})`,
      ).toBe(firstOwner);
    } finally {
      scratch.dispose();
    }
  });

  it("leaves healthy roots intact when another root is unreadable", async () => {
    const scratch = createScratchLibrary("foleyard-scan-unreadable-");
    try {
      const kick = scratch.writeFile("healthy/kick.wav");
      settings.setLibraryRoots([`${scratch.root}/missing`, `${scratch.root}/healthy`]);

      const status = await runScanToIdle();
      expect(status.phase).toBe("complete");
      expect(status.errors, "the unreadable root is reported").toBeGreaterThan(0);
      expect(files.getFileByPath(kick)?.removedAt).toBeNull();
      expect(files.getFileCount()).toBe(1);
    } finally {
      scratch.dispose();
    }
  });

  it("obtains metadata that needs a full parse on the first scan, not the second (B05)", async () => {
    // A contract-correct extractor: header-only parses cannot see past the
    // header, full parses can. The scanner must ask for the full parse while
    // the file is still unknown.
    state.extractor = async (_path, options) =>
      options?.fullParse
        ? { ...FULL_METADATA, duration: 7.5, fileSize: options?.fileSize ?? 1024 }
        : { ...FULL_METADATA, duration: null, codec: null, fileSize: options?.fileSize ?? 1024 };

    const scratch = createScratchLibrary("foleyard-scan-metadata-");
    try {
      const kick = scratch.writeFile("kick.wav");
      settings.setLibraryRoots([scratch.root]);

      await runScanToIdle();
      expect(
        files.getFileByPath(kick)?.duration,
        "a first scan must carry the full-parse duration",
      ).toBe(7.5);
    } finally {
      scratch.dispose();
    }
  });
});
