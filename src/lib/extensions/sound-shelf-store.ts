import type { SoundShelfStore } from "@foleyard/sound-shelf";
import { readJsonSetting, writeJsonSetting } from "./kv-store";

const SOUND_SHELF_KEY = "extension:sound-shelf:items";

export class DbSoundShelfStore implements SoundShelfStore {
  getFileIds(): string[] {
    const parsed = readJsonSetting<{ fileIds?: unknown } | null>(SOUND_SHELF_KEY, null);
    return Array.isArray(parsed?.fileIds)
      ? parsed.fileIds.filter((value): value is string => typeof value === "string") : [];
  }

  setFileIds(fileIds: string[]): void {
    writeJsonSetting(SOUND_SHELF_KEY, { fileIds });
  }
}
