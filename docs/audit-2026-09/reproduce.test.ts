// Audit evidence: these assertions record CURRENT BUGGY behavior, not desired contracts.
// Run separately from the product suite. Invert the assertions when implementing fixes.
import { expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { LibraryGathererService } from "../../packages/yard-tools/library-gatherer/src/service";
import { createYardExtensionContext } from "../../packages/yard-core/src/extensions/extension-context";
import { YardCommandRegistry } from "../../packages/yard-core/src/extensions/extension-command-registry";
import { initializeDatabaseSchema } from "../../src/lib/database/migrations";
import { SqliteAudioFileRepository } from "../../src/lib/database/file-repository";
import { rollbackBulkTags } from "../../src/app/library/file-query";
import { registerCommands as registerDropCommands } from "../../packages/yard-tools/drop-rules/src/commands";
import { permissions as dropPermissions } from "../../packages/yard-tools/drop-rules/src/permissions";

it("E04: Drop Rules apply ignores host filesystem denial", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "foleyard-audit-drop-"));
  try {
    const source = path.join(root, "source.wav"), destination = path.join(root, "ungranted");
    fs.writeFileSync(source, "sample");
    const commands = new YardCommandRegistry();
    const input = { targetDirectory: destination, files: [{ id: "unindexed", path: source, filename: "source.wav" }] };
    const context = createYardExtensionContext({ permissions: dropPermissions, input, selection: { fileIds: ["unindexed"] }, services: { commands, filesystem: { resolveReadablePath: async () => null, resolveWritablePath: async () => null } } });
    registerDropCommands(context);
    await commands.execute("drop-rules.apply", input);
    expect(fs.readdirSync(destination).some(name => name.endsWith(".wav"))).toBe(true);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

it("B01: gather overwrites an existing destination of a different size", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "foleyard-audit-"));
  try {
    const source = path.join(root, "source"), destination = path.join(root, "dest");
    fs.mkdirSync(source); fs.mkdirSync(destination);
    fs.writeFileSync(path.join(source, "hit.wav"), "NEW");
    fs.writeFileSync(path.join(destination, "hit.wav"), "ORIGINAL AUDIO");
    const context = createYardExtensionContext({ services: { commands: new YardCommandRegistry() }, permissions: ["library:read", "library:write", "files:read", "files:copy", "files:write"] });
    await new LibraryGathererService(context).gather({ sourceDirectories: [source], destinationDirectory: destination, preserveFolderNames: false });
    expect(fs.readFileSync(path.join(destination, "hit.wav"), "utf8")).toBe("NEW");
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

it("E01: a context with no permissions can invoke the supplied write service", () => {
  let changed = false;
  const context = createYardExtensionContext({ permissions: [], services: { commands: new YardCommandRegistry(), files: { markRemoved: () => { changed = true; } } } });
  context.services.files!.markRemoved(["a"]);
  expect(changed).toBe(true);
});

it("B02/B03: metadata matches merge identities and collection search ignores q", () => {
  const db = new Database(":memory:");
  try {
    initializeDatabaseSchema(db);
    const repo = new SqliteAudioFileRepository(db);
    const insert = db.prepare("INSERT INTO files (id,path,filename,library_root,file_size,duration,removed_at) VALUES (?,?,?,?,?,?,?)");
    insert.run("old", "/lib/old/hit.wav", "hit.wav", "/lib", 100, 1, "2026-09-01");
    insert.run("new", "/lib/new/hit.wav", "hit.wav", "/lib", 100, 1, null);
    db.prepare("INSERT INTO collections(id,name) VALUES ('c','Test')").run();
    db.prepare("INSERT INTO file_collections(file_id,collection_id) VALUES ('old','c')").run();
    expect(repo.reconcileMovedFiles()).toBe(1);
    expect(repo.getFileById("old")).toBeNull();
    expect(repo.getFiles({ collectionId: "c", query: "DOES_NOT_EXIST" })).toHaveLength(1);
    expect(repo.getFileCount({ collectionId: "c", query: "DOES_NOT_EXIST" })).toBe(1);
  } finally { db.close(); }
});

it("B04: failed tag operation rollback erases a later successful tag", () => {
  const file = { id: "a", filename: "a.wav", path: "/a.wav", directory: null, format: "wav", duration: 1, fileSize: 1, isFavorite: false, tags: [{ id: "later", name: "Later successful edit" }] };
  expect(rollbackBulkTags([file], new Map([["a", []]]))[0].tags).toEqual([]);
});
