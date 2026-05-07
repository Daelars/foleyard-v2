import { eq } from "drizzle-orm";

import { db, sqlite } from "./connection";
import * as schema from "@/lib/schema";

function getExtensionSettingKey(extensionId: string) {
  return `extension:${extensionId}:enabled`;
}

export function getLibraryRoot() {
  const row = db
    .select()
    .from(schema.settings)
    .where(eq(schema.settings.key, "libraryRoot"))
    .get();

  return row?.value ?? null;
}

export function setLibraryRoot(libraryRoot: string) {
  db.insert(schema.settings)
    .values({
      key: "libraryRoot",
      value: libraryRoot,
      updatedAt: new Date().toISOString(),
    })
    .onConflictDoUpdate({
      target: schema.settings.key,
      set: { value: libraryRoot, updatedAt: new Date().toISOString() },
    })
    .run();
}

export function clearLibraryData() {
  db.delete(schema.fileTags).run();
  db.delete(schema.fileCollections).run();
  db.delete(schema.tags).run();
  db.delete(schema.collections).run();
  db.delete(schema.files).run();
}

export function getExtensionEnabled(extensionId: string) {
  const row = db
    .select()
    .from(schema.settings)
    .where(eq(schema.settings.key, getExtensionSettingKey(extensionId)))
    .get();

  return row?.value === "true";
}

export function setExtensionEnabled(extensionId: string, enabled: boolean) {
  const key = getExtensionSettingKey(extensionId);
  const value = enabled ? "true" : "false";

  db.insert(schema.settings)
    .values({
      key,
      value,
      updatedAt: new Date().toISOString(),
    })
    .onConflictDoUpdate({
      target: schema.settings.key,
      set: { value, updatedAt: new Date().toISOString() },
    })
    .run();
}

export function getLibraryStats() {
  const activeRow = sqlite
    .prepare("SELECT COUNT(*) as count FROM files WHERE removed_at IS NULL")
    .get() as { count: number };
  const removedRow = sqlite
    .prepare("SELECT COUNT(*) as count FROM files WHERE removed_at IS NOT NULL")
    .get() as { count: number };

  return {
    activeFiles: activeRow.count,
    removedFiles: removedRow.count,
  };
}
