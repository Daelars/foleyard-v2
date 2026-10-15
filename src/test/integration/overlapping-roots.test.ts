import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { audioFileRecord, createTestDatabase, type TestDatabase } from "@/test/fixtures";
import { SqliteAudioFileRepository } from "@/lib/database/file-repository";
import { SqliteBrowseRepository } from "@/lib/database/browse-repository";
import { SqliteLibraryRootService } from "@/lib/database/root-detachment";
import { SqliteSettingsRepository } from "@/lib/database/settings-repository";

// Area: overlapping Library root ownership (#309). When a root is nested
// inside another configured root, the most specific (deepest) root owns the
// files it contains. Adding or removing one root re-resolves ownership through
// the same rule the scanner uses, so no read ever disagrees about the owner.

describe("overlapping Library roots (#309)", () => {
  let sqlite: TestDatabase;
  let files: SqliteAudioFileRepository;
  let settings: SqliteSettingsRepository;
  let roots: SqliteLibraryRootService;
  let browse: SqliteBrowseRepository;

  const parent = path.resolve("/overlap-library");
  const child = path.resolve("/overlap-library/sub");
  const nested = path.resolve("/overlap-library/sub/deep.wav");
  const nestedDeep = path.resolve("/overlap-library/sub/kit/hat.wav");
  const shallow = path.resolve("/overlap-library/top.wav");

  function index(root: string, filePath: string, directory: string | null) {
    files.batchUpsertFiles(
      [
        {
          ...audioFileRecord({ path: filePath, filename: path.basename(filePath) }),
          libraryRoot: root,
          directory,
        },
      ],
      new Date().toISOString(),
    );
  }

  beforeEach(() => {
    sqlite = createTestDatabase();
    files = new SqliteAudioFileRepository(sqlite);
    settings = new SqliteSettingsRepository(sqlite);
    roots = new SqliteLibraryRootService(sqlite);
    browse = new SqliteBrowseRepository(sqlite);
  });

  afterEach(() => {
    sqlite.close();
  });

  it("reassigns a detached nested root's files to the covering parent root", () => {
    // The nested root currently owns the file that lives inside it.
    index(child, nested, null);
    settings.setLibraryRoots([parent, child]);

    roots.detachRoot(child);

    // The nested root is gone from settings, but the file is still inside the
    // configured parent: ownership moves to the parent instead of detaching.
    expect(settings.getLibraryRoots()).toEqual([parent]);
    const row = files.getFileByPath(nested);
    expect(row?.detachedAt).toBeNull();
    expect(row?.libraryRoot).toBe(parent);
    expect(row?.directory).toBe("sub");
    // Root filters agree with the resolved owner.
    expect(files.getFiles({ libraryRoot: parent, limit: 10 }).map((entry) => entry.path)).toEqual([nested]);
    expect(files.getFiles({ libraryRoot: child, limit: 10 })).toEqual([]);
  });

  it("keeps a forgotten nested root's files when the parent still owns them", () => {
    index(child, nested, null);
    index(parent, shallow, null);
    settings.setLibraryRoots([parent, child]);

    const result = roots.forgetRoot(child);

    // Only the file the parent does not cover is deleted; the nested file is
    // reassigned to the parent rather than lost.
    expect(result.files).toBe(0);
    expect(settings.getLibraryRoots()).toEqual([parent]);
    expect(files.getFileByPath(nested)?.libraryRoot).toBe(parent);
    expect(files.getFileByPath(shallow)?.libraryRoot).toBe(parent);
    expect(files.getFileCount({ showRemoved: true })).toBe(2);
  });

  it("hands a re-added nested root's files back to it immediately", () => {
    // The nested file was indexed while only the parent root existed.
    index(parent, nested, "sub");
    settings.setLibraryRoots([parent]);

    roots.reattachRoot(child);

    expect(settings.getLibraryRoots()).toEqual([parent, child]);
    const row = files.getFileByPath(nested);
    expect(row?.libraryRoot).toBe(child);
    expect(row?.directory).toBeNull();
    expect(files.getFiles({ libraryRoot: child, atLibraryRoot: true, limit: 10 }).map((entry) => entry.path)).toEqual([nested]);
  });

  it("reports directory navigation relative to the resolved owner", () => {
    // The nested root owns a file at its top and one in its "kit" directory;
    // the parent owns a file at its own top.
    index(child, nested, null);
    index(child, nestedDeep, "kit");
    index(parent, shallow, null);
    settings.setLibraryRoots([parent, child]);

    // Directory navigation for the parent never lists the child's "kit";
    // it belongs to the child, the resolved owner of those files.
    expect(browse.getSubdirectoriesForRoot(parent, null)).toEqual([]);
    expect(browse.getSubdirectoriesForRoot(child, null)).toEqual(["kit"]);
    expect(browse.getDirectoriesForRoot(parent)).toEqual([]);
    expect(browse.getDirectoriesForRoot(child)).toEqual(["kit"]);
  });
});
