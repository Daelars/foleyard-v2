import { eq } from "drizzle-orm";
import type { SoundShelfStore } from "@foleyard/sound-shelf";

import { db } from "@/lib/database/connection";
import * as schema from "@/lib/schema";

const SOUND_SHELF_KEY = "extension:sound-shelf:items";

type StoredSoundShelf = {
  fileIds: string[];
};

export class DbSoundShelfStore implements SoundShelfStore {
  getFileIds(): string[] {
    const row = db
      .select()
      .from(schema.settings)
      .where(eq(schema.settings.key, SOUND_SHELF_KEY))
      .get();

    if (!row?.value) {
      return [];
    }

    try {
      const parsed = JSON.parse(row.value) as Partial<StoredSoundShelf>;
      return Array.isArray(parsed.fileIds)
        ? parsed.fileIds.filter((value): value is string => typeof value === "string")
        : [];
    } catch {
      return [];
    }
  }

  setFileIds(fileIds: string[]): void {
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
}
