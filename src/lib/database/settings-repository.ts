import { eq } from "drizzle-orm";

import { db, sqlite } from "./connection";
import * as schema from "@/lib/schema";

function getExtensionSettingKey(extensionId: string) {
  return `extension:${extensionId}:enabled`;
}

export function getLibraryRoot() {
  return getLibraryRoots()[0] ?? null;
}

export function getLibraryRoots() {
  const rootsRow = db
    .select()
    .from(schema.settings)
    .where(eq(schema.settings.key, "libraryRoots"))
    .get();

  if (rootsRow?.value) {
    try {
      const parsed = JSON.parse(rootsRow.value);
      if (Array.isArray(parsed)) {
        return parsed.filter(
          (value): value is string => typeof value === "string" && value.length > 0,
        );
      }
    } catch {
      // Fall back to the legacy single-root setting below.
    }
  }

  const row = db
    .select()
    .from(schema.settings)
    .where(eq(schema.settings.key, "libraryRoot"))
    .get();

  return row?.value ? [row.value] : [];
}

export function setLibraryRoot(libraryRoot: string) {
  setLibraryRoots([libraryRoot]);
}

export function setLibraryRoots(libraryRoots: string[]) {
  const roots = Array.from(new Set(libraryRoots.filter(Boolean)));
  const now = new Date().toISOString();

  db.insert(schema.settings)
    .values({
      key: "libraryRoot",
      value: roots[0] ?? null,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: schema.settings.key,
      set: { value: roots[0] ?? null, updatedAt: now },
    })
    .run();

  db.insert(schema.settings)
    .values({
      key: "libraryRoots",
      value: JSON.stringify(roots),
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: schema.settings.key,
      set: { value: JSON.stringify(roots), updatedAt: now },
    })
    .run();
}

export function addLibraryRoot(libraryRoot: string) {
  setLibraryRoots([...getLibraryRoots(), libraryRoot]);
}

export function removeLibraryRoot(libraryRoot: string) {
  setLibraryRoots(getLibraryRoots().filter((root) => root !== libraryRoot));
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
