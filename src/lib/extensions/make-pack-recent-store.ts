import { readJsonSetting, writeJsonSetting } from "./kv-store";

const RECENT_KEY = "extension:make-pack:recent";
const RECENT_LIMIT = 25;

export function getRecentMakePackFileIds(): string[] {
  const parsed = readJsonSetting<{ fileIds?: unknown } | null>(RECENT_KEY, null);
  return Array.isArray(parsed?.fileIds)
    ? parsed.fileIds.filter((value): value is string => typeof value === "string") : [];
}

export function recordRecentMakePackFile(fileId: string) {
  const current = getRecentMakePackFileIds().filter((id) => id !== fileId);
  writeJsonSetting(RECENT_KEY, { fileIds: [fileId, ...current].slice(0, RECENT_LIMIT) });
}
