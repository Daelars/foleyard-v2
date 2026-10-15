// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createV2FolderOperations } from "@yard-core";

import { createTestDatabase, type TestDatabase } from "@/test/fixtures";
import { SqliteAudioFileRepository } from "@/lib/database/file-repository";
import { SqliteSettingsRepository } from "@/lib/database/settings-repository";
import { createV2LibraryMutationPorts } from "@/lib/extensions-v2/library-mutations";
import { createV2FolderScanPorts } from "@/lib/extensions-v2/maintenance";

// Area: Library Gatherer v2 ownership (#282). A gathered file must be
// indexed as owned by a configured Library root, with the destination's
// directory recorded, so it stays a valid input to every Library read
// (search/preview) and to the Folder Janitor. A rootless or foreign-root
// record is refused at the write boundary (#271's ownership contract).

const state = vi.hoisted(() => ({
  files: null as SqliteAudioFileRepository | null,
  settings: null as SqliteSettingsRepository | null,
}));

vi.mock("@/lib/db", () => ({
  batchUpsertFiles: (records: Parameters<SqliteAudioFileRepository["batchUpsertFiles"]>[0], now: string) =>
    state.files!.batchUpsertFiles(records, now),
  batchMarkRemoved: (paths: string[], removedAt: string, now: string) =>
    state.files!.batchMarkRemoved(paths, removedAt, now),
  getLibraryRoots: () => state.settings!.getLibraryRoots(),
}));

function gatheredRecord(overrides: {
  path: string;
  libraryRoot?: string | null;
  directory?: string | null;
}) {
  const filename = path.basename(overrides.path);
  return {
    path: overrides.path,
    filename,
    libraryRoot: overrides.libraryRoot === undefined ? null : overrides.libraryRoot,
    directory: overrides.directory === undefined ? null : overrides.directory,
    format: "wav",
    codec: null,
    duration: null,
    sampleRate: null,
    bitDepth: null,
    channels: null,
    fileSize: 4,
    mtimeMs: 1,
    removedAt: null,
    lastScannedAt: new Date().toISOString(),
  };
}

describe("Library Gatherer v2 gathered-file ownership (#282)", () => {
  let sqlite: TestDatabase;
  let files: SqliteAudioFileRepository;
  let settings: SqliteSettingsRepository;
  let root: string;

  beforeEach(() => {
    sqlite = createTestDatabase();
    files = new SqliteAudioFileRepository(sqlite);
    settings = new SqliteSettingsRepository(sqlite);
    state.files = files;
    state.settings = settings;
    root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "foleyard-gather-")));
    settings.setLibraryRoots([root]);
  });

  afterEach(() => {
    sqlite.close();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("writes an owned record that search, preview, and the Folder Janitor all see", async () => {
    const drums = path.join(root, "Drums");
    fs.mkdirSync(drums);
    const dest = path.join(drums, "kick.wav");
    fs.writeFileSync(dest, "kick");

    const ports = createV2LibraryMutationPorts({ libraryRoots: () => [root] });
    ports.insertRecords(
      [
        gatheredRecord({ path: dest, libraryRoot: root, directory: "Drums" }),
      ],
      new Date().toISOString(),
    );

    const row = files.getFileByPath(dest)!;
    expect(row).not.toBeNull();
    expect(row.libraryRoot).toBe(root);
    expect(row.directory).toBe("Drums");
    expect(row.removedAt).toBeNull();

    // Preview/search reads: the owned predicate sees the gathered file.
    const search = files.getFiles({ query: "kick", limit: 10, showRemoved: false });
    expect(search.map((file) => file.filename)).toEqual(["kick.wav"]);
    expect(files.getOwnedFilesByIds([row.id]).map((file) => file.id)).toEqual([row.id]);

    // Folder Janitor: the authorized folder listing reaches the destination.
    const folderOperations = createV2FolderOperations({
      extensionId: "folder-janitor-v2",
      effectivePermissions: ["files:read"],
      folders: createV2FolderScanPorts({ libraryRoots: () => [root] }),
    });
    const listing = await folderOperations.listFolder({ path: drums });
    expect(listing.entries.map((entry) => entry.name)).toContain("kick.wav");
  });

  it("refuses a rootless or foreign-root gathered record instead of writing it", () => {
    const dest = path.join(root, "orphan.wav");
    const ports = createV2LibraryMutationPorts({ libraryRoots: () => [root] });
    const now = new Date().toISOString();

    expect(() =>
      ports.insertRecords([gatheredRecord({ path: dest })], now),
    ).toThrowError(/Library root/);
    expect(() =>
      ports.insertRecords(
        [gatheredRecord({ path: dest, libraryRoot: path.join(root, "..", "elsewhere") })],
        now,
      ),
    ).toThrowError(/Library root/);
    expect(files.getFiles({ limit: 10, showRemoved: true })).toEqual([]);
  });
});
