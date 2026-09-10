// Audit evidence: these assertions record CURRENT BUGGY behavior, not desired contracts.
// Run separately from the product suite. Invert the assertions when implementing fixes.
import { expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { createYardExtensionContext } from "../../packages/yard-core/src/extensions/extension-context";
import { YardCommandRegistry } from "../../packages/yard-core/src/extensions/extension-command-registry";
import { initializeDatabaseSchema } from "../../src/lib/database/migrations";
import { SqliteAudioFileRepository } from "../../src/lib/database/file-repository";
import { rollbackBulkTags } from "../../src/app/library/file-query";

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
