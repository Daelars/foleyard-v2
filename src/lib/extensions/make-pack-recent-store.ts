import { eq } from "drizzle-orm";

import { db } from "@/lib/database/connection";
import * as schema from "@/lib/schema";

const RECENT_KEY = "extension:make-pack:recent";
const RECENT_LIMIT = 25;

type StoredRecentSounds = {
  fileIds: string[];
};

function readRecent(): StoredRecentSounds {
  const row = db
    .select()
    .from(schema.settings)
    .where(eq(schema.settings.key, RECENT_KEY))
    .get();

  if (!row?.value) {
    return { fileIds: [] };
  }

  try {
    const parsed = JSON.parse(row.value) as Partial<StoredRecentSounds>;
    return {
      fileIds: Array.isArray(parsed.fileIds)
        ? parsed.fileIds.filter((value): value is string => typeof value === "string")
        : [],
    };
  } catch {
    return { fileIds: [] };
  }
}

function writeRecent(fileIds: string[]) {
  const value = JSON.stringify({ fileIds: fileIds.slice(0, RECENT_LIMIT) });
  const updatedAt = new Date().toISOString();

  db.insert(schema.settings)
    .values({
      key: RECENT_KEY,
      value,
      updatedAt,
    })
    .onConflictDoUpdate({
      target: schema.settings.key,
      set: {
        value,
        updatedAt,
      },
    })
    .run();
}

export function getRecentMakePackFileIds() {
  return readRecent().fileIds;
}

export function recordRecentMakePackFile(fileId: string) {
  const current = readRecent().fileIds.filter((id) => id !== fileId);
  writeRecent([fileId, ...current]);
}
