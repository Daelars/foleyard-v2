import fs from "node:fs";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  audioFileRecord,
  createExtensionContext,
  createScratchLibrary,
  createTestDatabase,
  type ScratchLibrary,
  type TestDatabase,
} from "@/test/fixtures";
import { SqliteAudioFileRepository } from "@/lib/database/file-repository";
import { SqliteTagRepository } from "@/lib/database/tag-repository";
import { LibraryGathererService } from "../../../packages/yard-tools/library-gatherer/src/service";
import { MakePackService } from "../../../packages/yard-tools/make-pack/src/service";
import { FolderJanitorService } from "../../../packages/yard-tools/folder-janitor/src/service";
import { createDragStage } from "../../../packages/yard-tools/drop-rules/src/staging";

// Area: data-loss prevention (#136). Replaces the five extension service tests,
// the drag staging test and the batch mutation tests — 21 tests.
//
// This is the smallest reduction of the eight areas, 21 down to 8, and
// deliberately so. Everything here is irreversible against a user's actual
// sound library. Losing an assertion in this file costs somebody their files.

const WRITE_PERMISSIONS = [
  "library:read",
  "library:write",
  "files:read",
  "files:copy",
  "files:write",
];

let library: ScratchLibrary;

beforeEach(() => {
  library = createScratchLibrary("foleyard-dataloss-");
});

afterEach(() => library.dispose());

describe("data-loss prevention", () => {
  it("previews a gather without copying, then copies and reports", async () => {
    const source = library.directory("downloads");
    const destination = path.join(library.root, "library");
    library.writeFile("downloads/Boom.wav", "sound");
    library.writeFile("downloads/notes.txt", "ignore");

    const service = new LibraryGathererService(
      createExtensionContext(WRITE_PERMISSIONS),
    );

    const previewed = await service.preview({
      sourceDirectories: [source],
      destinationDirectory: destination,
    });
    expect(previewed.copied, "preview counts the audio file only").toBe(1);
    expect(
      fs.existsSync(previewed.files[0].outputPath),
      "preview must not write",
    ).toBe(false);

    const gathered = await service.gather({
      sourceDirectories: [source],
      destinationDirectory: destination,
    });
    expect(gathered.copied).toBe(1);
    expect(fs.existsSync(gathered.files[0].outputPath)).toBe(true);
    expect(fs.readFileSync(gathered.files[0].outputPath, "utf8")).toBe("sound");
  });

  it.fails(
    "leaves an existing destination file intact during a gather (B01)",
    async () => {
      const source = library.directory("source");
      const destination = library.directory("dest");
      library.writeFile("source/hit.wav", "NEW");
      library.writeFile("dest/hit.wav", "ORIGINAL AUDIO");

      await new LibraryGathererService(
        createExtensionContext(WRITE_PERMISSIONS),
      ).gather({
        sourceDirectories: [source],
        destinationDirectory: destination,
        preserveFolderNames: false,
      });

      // makeUniqueOutputPath reserves names against the plan only, never
      // against what is already on disk, and copyFile replaces.
      expect(fs.readFileSync(path.join(destination, "hit.wav"), "utf8")).toBe(
        "ORIGINAL AUDIO",
      );
    },
  );

  it("packs to a folder and a zip, deduping duplicate filenames", async () => {
    const service = new MakePackService(
      createExtensionContext(WRITE_PERMISSIONS),
    );
    const file = (name: string, contents: string, at = name) => ({
      id: at,
      filename: name,
      path: library.writeFile(`sources/${at}`, contents),
      duration: null,
      format: path.extname(name).slice(1),
      fileSize: contents.length,
    });

    const folder = await service.createPack({
      source: "selection",
      files: [file("hit.wav", "sound")],
      destinationDirectory: path.join(library.root, "out-folder"),
      packName: "Project Hits",
      outputFormat: "folder",
    });
    expect(folder.fileCount).toBe(1);
    expect(fs.existsSync(path.join(folder.outputPath, "hit.wav"))).toBe(true);
    expect(fs.existsSync(path.join(folder.outputPath, "manifest.json"))).toBe(
      true,
    );

    const deduped = await service.createPack({
      source: "shelf",
      files: [
        file("same.wav", "one"),
        file("same.wav", "two", "nested-same.wav"),
      ],
      destinationDirectory: path.join(library.root, "out-dedupe"),
      packName: "Duplicates",
    });
    expect(deduped.items.map((item) => item.outputName)).toEqual([
      "same.wav",
      "same 2.wav",
    ]);

    const zipped = await service.createPack({
      source: "recent",
      files: [file("whoosh.wav", "zip-data")],
      destinationDirectory: path.join(library.root, "out-zip"),
      packName: "Recent",
      outputFormat: "zip",
    });
    expect(zipped.outputPath.endsWith(".zip")).toBe(true);
    expect(fs.statSync(zipped.outputPath).size).toBeGreaterThan(0);
  });

  it.fails(
    "leaves a pre-existing manifest sidecar intact during a zip export (B12)",
    async () => {
      const destination = library.directory("out");
      const packName = "Recent";
      // The ZIP path writes .<packName>-manifest.tmp.json beside the output and
      // unconditionally removes it in finally. The name is predictable and is
      // not reserved exclusively, so an unrelated file at that path is deleted.
      const sidecar = path.join(destination, `.${packName}-manifest.tmp.json`);
      fs.writeFileSync(sidecar, '{"mine":true}');

      await new MakePackService(
        createExtensionContext(WRITE_PERMISSIONS),
      ).createPack({
        source: "recent",
        files: [
          {
            id: "a",
            filename: "a.wav",
            path: library.writeFile("sources/a.wav", "audio"),
            duration: null,
            format: "wav",
            fileSize: 5,
          },
        ],
        destinationDirectory: destination,
        packName,
        outputFormat: "zip",
      });

      expect(fs.existsSync(sidecar), "a file we did not create was removed").toBe(
        true,
      );
    },
  );

  it("reports what is wrong in a root, then deletes only empty folders inside it", async () => {
    const root = library.directory("library");
    const empty = library.directory("library/empty");
    const outside = library.directory("private");

    // Scanning is the read half: it must find every issue kind, because the
    // deletion half acts on what it reports.
    const duplicateA = library.writeFile("library/Hit.wav", "x");
    const duplicateB = library.writeFile("library/dupe/Hit.wav", "x");
    const oddFormat = library.writeFile("library/Odd.xyz", "content");
    const scanned = await new FolderJanitorService(
      createExtensionContext(WRITE_PERMISSIONS),
    ).scan({
      libraryRoots: [root],
      files: [
        ["one", "Hit.wav", duplicateA, "wav", 1],
        ["two", "Hit.wav", duplicateB, "wav", 1],
        ["odd", "Odd.xyz", oddFormat, "xyz", 7],
      ].map(([id, filename, filePath, format, fileSize]) => ({
        id: id as string,
        filename: filename as string,
        path: filePath as string,
        format: format as string,
        fileSize: fileSize as number,
        duration: null,
      })),
      tinyFileThresholdBytes: 2,
    });

    for (const kind of [
      "duplicate",
      "tiny-file",
      "weird-format",
      "empty-folder",
    ]) {
      expect(
        scanned.issues.some((issue) => issue.kind === kind),
        `scan must report ${kind}`,
      ).toBe(true);
    }

    const resolveReadablePath = async (candidate: string) => {
      let resolved: string;
      try {
        resolved = await fs.promises.realpath(candidate);
      } catch {
        return null;
      }
      const relative = path.relative(fs.realpathSync(root), resolved);
      if (
        relative === ".." ||
        relative.startsWith(`..${path.sep}`) ||
        path.isAbsolute(relative)
      ) {
        return null;
      }
      return resolved;
    };

    const service = new FolderJanitorService(
      createExtensionContext(
        [...WRITE_PERMISSIONS, "files:delete"],
        { filesystem: { resolveReadablePath } },
      ),
    );

    await service.deleteFolders([empty]);
    expect(fs.existsSync(empty), "an empty folder in a root is removed").toBe(
      false,
    );

    // Outside any root: the resolver returns null, so the folder survives.
    await service.deleteFolders([outside]).catch(() => {});
    expect(fs.existsSync(outside), "a folder outside every root survives").toBe(
      true,
    );

    // Non-empty by the time deletion runs
    const occupied = library.directory("library/occupied");
    library.writeFile("library/occupied/keep.wav", "audio");
    await service.deleteFolders([occupied]).catch(() => {});
    expect(
      fs.existsSync(path.join(occupied, "keep.wav")),
      "a folder that gained a file is rechecked before deletion",
    ).toBe(true);
  });

  it.fails(
    "keeps two distinct same-size recordings from inheriting each other (B02)",
    () => {
      const sqlite: TestDatabase = createTestDatabase();
      try {
        const repository = new SqliteAudioFileRepository(sqlite);
        const insert = sqlite.prepare(
          "INSERT INTO files (id,path,filename,library_root,file_size,duration,removed_at) VALUES (?,?,?,?,?,?,?)",
        );
        insert.run("old", "/lib/old/hit.wav", "hit.wav", "/lib", 100, 1, "2026-09-01");
        insert.run("new", "/lib/new/hit.wav", "hit.wav", "/lib", 100, 1, null);
        sqlite
          .prepare("INSERT INTO collections(id,name) VALUES ('c','Test')")
          .run();
        sqlite
          .prepare(
            "INSERT INTO file_collections(file_id,collection_id) VALUES ('old','c')",
          )
          .run();

        // Same name, same size, same duration is not identity. Relinking here
        // destroys the old record and hands its collections to a different
        // recording.
        expect(repository.reconcileMovedFiles()).toBe(0);
        expect(repository.getFileById("old")).not.toBeNull();
      } finally {
        sqlite.close();
      }
    },
  );

  it.fails("keeps a user exclusion through the next scan (B10)", () => {
    const sqlite: TestDatabase = createTestDatabase();
    try {
      const repository = new SqliteAudioFileRepository(sqlite);
      const now = new Date().toISOString();
      const record = audioFileRecord({ path: "/lib/gone.wav" });
      repository.batchUpsertFiles([record], now);

      repository.batchMarkRemoved([record.path], now, now);
      expect(repository.getFiles()).toHaveLength(0);

      // A rescan rediscovers the file on disk. Removal means the user excluded
      // it, so re-seeing the path must not silently re-admit it to the library.
      repository.batchUpsertFiles([record], new Date().toISOString());
      expect(
        repository.getFiles(),
        "a user exclusion came back on the next scan",
      ).toHaveLength(0);
    } finally {
      sqlite.close();
    }
  });

  it("rolls batch mutations back as a unit and stages only what it owns", async () => {
    const sqlite: TestDatabase = createTestDatabase();
    try {
      const repository = new SqliteAudioFileRepository(sqlite);
      const tags = new SqliteTagRepository(sqlite);
      const tagId = tags.createTag("Loud");
      repository.batchUpsertFiles(
        [0, 1, 2].map((index) =>
          audioFileRecord({ path: `/lib/file-${index}.wav` }),
        ),
        new Date().toISOString(),
      );
      const ids = repository.getFiles({ limit: 10 }).map((file) => file.id);

      repository.setFileTagBatch(ids, tagId, true);
      expect(
        tags.getTagsForFiles(ids).size,
        "a whole batch commits together",
      ).toBe(ids.length);

      expect(() =>
        repository.setFileTagBatch([...ids, "missing-id"], tagId, true),
      ).toThrow(/does not exist/);

      expect(() =>
        repository.setFavorites([...ids, "missing-id"], true),
      ).toThrow(/does not exist/);
      expect(
        repository.getFileCount({ favorites: true }),
        "one unknown id rolls the whole batch back",
      ).toBe(0);

      repository.setFavorites(ids, true);
      repository.setFavorites([ids[0]], false);
      expect(
        repository.getFileCount({ favorites: true }),
        "favourites take an explicit target state",
      ).toBe(ids.length - 1);
    } finally {
      sqlite.close();
    }

    // Drag staging evicts its own expired stages and nothing else.
    const stageRoot = library.directory("stages");
    const expired = await createDragStage(stageRoot);
    const recent = await createDragStage(stageRoot);
    const userOwned = library.directory("stages/user-sounds");
    const past = new Date(Date.now() - 48 * 60 * 60 * 1000);
    fs.utimesSync(expired, past, past);
    fs.utimesSync(userOwned, past, past);

    const next = await createDragStage(stageRoot);

    expect(fs.existsSync(expired), "an expired owned stage is evicted").toBe(
      false,
    );
    expect(fs.existsSync(recent), "a recent owned stage survives").toBe(true);
    expect(
      fs.existsSync(userOwned),
      "an equally old directory we do not own survives",
    ).toBe(true);
    expect(fs.existsSync(next)).toBe(true);
  });
});
