import { eq } from "drizzle-orm";

import { db } from "@/lib/database/connection";
import * as schema from "@/lib/schema";

const SOUND_SHELF_KEY = "extension:sound-shelf:items";

type StoredSoundShelf = {
  fileIds: string[];
};

function readShelf(): StoredSoundShelf {
  const row = db
    .select()
    .from(schema.settings)
    .where(eq(schema.settings.key, SOUND_SHELF_KEY))
    .get();

  if (!row?.value) {
    return { fileIds: [] };
  }

  try {
    const parsed = JSON.parse(row.value) as Partial<StoredSoundShelf>;
    return {
      fileIds: Array.isArray(parsed.fileIds)
        ? parsed.fileIds.filter((value): value is string => typeof value === "string")
        : [],
    };
  } catch {
    return { fileIds: [] };
  }
}

function writeShelf(fileIds: string[]) {
  const value = JSON.stringify({ fileIds });

  db.insert(schema.settings)
    .values({
      key: SOUND_SHELF_KEY,
      value,
      updatedAt: new Date().toISOString(),
    })
    .onConflictDoUpdate({
      target: schema.settings.key,
      set: {
        value,
        updatedAt: new Date().toISOString(),
      },
    })
    .run();
}

export function getSoundShelfFileIds() {
  return readShelf().fileIds;
}

export function addToSoundShelf(fileIds: string[]) {
  const current = new Set(readShelf().fileIds);
  let added = 0;

  for (const fileId of fileIds) {
    if (!current.has(fileId)) {
      current.add(fileId);
      added += 1;
    }
  }

  const next = Array.from(current);
  writeShelf(next);

  return {
    added,
    removed: 0,
    remaining: next.length,
  };
}

export function removeFromSoundShelf(fileIds: string[]) {
  const targetIds = new Set(fileIds);
  const current = readShelf().fileIds;
  const next = current.filter((fileId) => !targetIds.has(fileId));
  const removed = current.length - next.length;

  writeShelf(next);

  return {
    added: 0,
    removed,
    remaining: next.length,
  };
}

export function clearSoundShelf() {
  const current = readShelf().fileIds;
  writeShelf([]);

  return {
    added: 0,
    removed: current.length,
    remaining: 0,
  };
}
