import { eq } from "drizzle-orm";
import { db } from "@/lib/database/connection";
import { settings } from "@/lib/schema";

export function readJsonSetting<T>(key: string, fallback: T): T {
  const row = db.select().from(settings).where(eq(settings.key, key)).get();
  if (!row?.value) return fallback;
  try { return JSON.parse(row.value) as T; } catch { return fallback; }
}

export function writeJsonSetting(key: string, value: unknown): void {
  const serialized = JSON.stringify(value);
  const updatedAt = new Date().toISOString();
  db.insert(settings).values({ key, value: serialized, updatedAt })
    .onConflictDoUpdate({ target: settings.key, set: { value: serialized, updatedAt } }).run();
}
