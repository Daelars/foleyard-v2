import { readV2SettingsRow, writeV2SettingsRow } from "./settings-state";

/**
 * Recent-preview record feeding the v2 "recent" named selection source
 * (Make Pack v2 from-recent). Formerly the v1 make-pack recent store;
 * the key moved into the v2 namespace when make-pack retired.
 */

const RECENT_KEY = "v2:recent-files";
const RECENT_LIMIT = 25;

export function getRecentMakePackFileIds(): string[] {
  const parsed = readV2SettingsRow(RECENT_KEY) as { fileIds?: unknown } | null | undefined;
  return Array.isArray(parsed?.fileIds)
    ? parsed.fileIds.filter((value): value is string => typeof value === "string")
    : [];
}

export function recordRecentMakePackFile(fileId: string): void {
  const current = getRecentMakePackFileIds().filter((id) => id !== fileId);
  writeV2SettingsRow(RECENT_KEY, { fileIds: [fileId, ...current].slice(0, RECENT_LIMIT) });
}