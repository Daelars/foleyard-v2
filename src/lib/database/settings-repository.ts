import { count, eq, isNotNull, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";

import type { SettingsRepository } from "@yard-core";
import type { LibraryStats } from "@yard-core";

import { sqlite as defaultSqlite } from "./connection";
import * as schema from "@/lib/schema";

import type Database from "better-sqlite3";

function getExtensionSettingKey(extensionId: string) {
  return `extension:${extensionId}:enabled`;
}

export class SqliteSettingsRepository implements SettingsRepository {
  private sqlite: Database;
  private db: ReturnType<typeof drizzle<typeof schema>>;

  constructor(sqlite: Database) {
    this.sqlite = sqlite;
    this.db = drizzle(sqlite, { schema });
  }

  getLibraryRoot(): string | null {
    return this.getLibraryRoots()[0] ?? null;
  }

  getLibraryRoots(): string[] {
    const rootsRow = this.db
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
      } catch {}
    }

    const row = this.db
      .select()
      .from(schema.settings)
      .where(eq(schema.settings.key, "libraryRoot"))
      .get();

    return row?.value ? [row.value] : [];
  }

  setLibraryRoot(libraryRoot: string): void {
    this.setLibraryRoots([libraryRoot]);
  }

  setLibraryRoots(libraryRoots: string[]): void {
    const roots = Array.from(new Set(libraryRoots.filter(Boolean)));
    const now = new Date().toISOString();

    this.db.insert(schema.settings)
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

    this.db.insert(schema.settings)
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

  addLibraryRoot(libraryRoot: string): void {
    this.setLibraryRoots([...this.getLibraryRoots(), libraryRoot]);
  }

  removeLibraryRoot(libraryRoot: string): void {
    this.setLibraryRoots(this.getLibraryRoots().filter((root) => root !== libraryRoot));
  }

  clearLibraryData(): void {
    this.db.delete(schema.fileTags).run();
    this.db.delete(schema.fileCollections).run();
    this.db.delete(schema.tags).run();
    this.db.delete(schema.collections).run();
    this.db.delete(schema.files).run();
  }

  getExtensionEnabled(extensionId: string): boolean {
    const row = this.db
      .select()
      .from(schema.settings)
      .where(eq(schema.settings.key, getExtensionSettingKey(extensionId)))
      .get();

    return row?.value === "true";
  }

  setExtensionEnabled(extensionId: string, enabled: boolean): void {
    const key = getExtensionSettingKey(extensionId);
    const value = enabled ? "true" : "false";

    this.db.insert(schema.settings)
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

  getLibraryStats(): LibraryStats {
    const activeRow = this.db
      .select({ count: count() })
      .from(schema.files)
      .where(isNull(schema.files.removedAt))
      .get();
    const removedRow = this.db
      .select({ count: count() })
      .from(schema.files)
      .where(isNotNull(schema.files.removedAt))
      .get();

    return {
      activeFiles: activeRow?.count ?? 0,
      removedFiles: removedRow?.count ?? 0,
    };
  }

  getOnboardingVersion(): number {
    const row = this.db
      .select()
      .from(schema.settings)
      .where(eq(schema.settings.key, "onboarding_version"))
      .get();

    const version = Number.parseInt(row?.value ?? "0", 10);
    return Number.isFinite(version) ? version : 0;
  }

  setOnboardingVersion(version: number): void {
    const now = new Date().toISOString();

    this.db.insert(schema.settings)
      .values({
        key: "onboarding_version",
        value: String(version),
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: schema.settings.key,
        set: { value: String(version), updatedAt: now },
      })
      .run();
  }
}

let _settingsRepo: SqliteSettingsRepository | null = null;
function getSettingsRepo(): SqliteSettingsRepository {
  if (!_settingsRepo) {
    _settingsRepo = new SqliteSettingsRepository(defaultSqlite as unknown as Database);
  }
  return _settingsRepo;
}

export const getLibraryRoot = () => getSettingsRepo().getLibraryRoot();
export const getLibraryRoots = () => getSettingsRepo().getLibraryRoots();
export const setLibraryRoot = (root: string) => getSettingsRepo().setLibraryRoot(root);
export const setLibraryRoots = (roots: string[]) => getSettingsRepo().setLibraryRoots(roots);
export const addLibraryRoot = (root: string) => getSettingsRepo().addLibraryRoot(root);
export const removeLibraryRoot = (root: string) => getSettingsRepo().removeLibraryRoot(root);
export const clearLibraryData = () => getSettingsRepo().clearLibraryData();
export const getExtensionEnabled = (extId: string) => getSettingsRepo().getExtensionEnabled(extId);
export const setExtensionEnabled = (extId: string, enabled: boolean) => getSettingsRepo().setExtensionEnabled(extId, enabled);
export const getLibraryStats = () => getSettingsRepo().getLibraryStats();
export const getOnboardingVersion = () => getSettingsRepo().getOnboardingVersion();
export const setOnboardingVersion = (version: number) => getSettingsRepo().setOnboardingVersion(version);
