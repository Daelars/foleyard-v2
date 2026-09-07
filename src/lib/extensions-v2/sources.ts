import type { V2NamedSelectionSource } from "@yard-core";

import { getRecentMakePackFileIds } from "@/lib/extensions/make-pack-recent-store";
import { DbSoundShelfStore } from "@/lib/extensions/sound-shelf-store";

/**
 * Application-owned named selection sources for Make Pack v2
 * (Application context, R8).
 *
 * These adapters read existing persisted application records through
 * the established storage contracts (the Sound Shelf store and the
 * recent-preview record). They never execute v1 extension commands
 * and never call v1 transport: the data path is store → IDs → the
 * v2 operation services, which resolve IDs against the Library index.
 *
 * Runtime-availability contract: when the underlying persisted
 * record cannot be read, `listIds` throws a descriptive error (the
 * command fails with that reason) instead of silently returning an
 * empty selection. An empty-but-readable record resolves to an
 * empty selection, and the handler reports "no sounds" rather than
 * succeeding vacuously.
 */

export const SHELF_SOURCE_NAME = "shelf";
export const RECENT_SOURCE_NAME = "recent";

function cleanIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string" && entry.length > 0);
}

function describeFailure(source: string, error: unknown): Error {
  const reason = error instanceof Error ? error.message : String(error);
  return new Error(
    `The ${source} source is unavailable (persisted application record could not be read: ${reason}); retry after the Library loads.`,
  );
}

/**
 * Sound Shelf source. Reads the persisted Shelf record; the same
 * store the v1 Sound Shelf workflow writes, read directly — no v1
 * command execution, no v1 transport.
 */
export function createShelfSelectionSource(
  readIds: () => string[] = readShelfIds,
): V2NamedSelectionSource {
  return {
    name: SHELF_SOURCE_NAME,
    requiredPermission: "library:read",
    listIds: () => {
      try {
        return cleanIds(readIds());
      } catch (error) {
        throw describeFailure("Sound Shelf", error);
      }
    },
  };
}

/**
 * Recently previewed sounds source. Reads the persisted recent
 * record the audio route maintains on every preview; same
 * never-execute-v1 rule as the Shelf adapter.
 */
export function createRecentSelectionSource(
  readIds: () => string[] = readRecentIds,
): V2NamedSelectionSource {
  return {
    name: RECENT_SOURCE_NAME,
    requiredPermission: "library:read",
    listIds: () => {
      try {
        return cleanIds(readIds());
      } catch (error) {
        throw describeFailure("recent sounds", error);
      }
    },
  };
}

function readShelfIds(): string[] {
  return new DbSoundShelfStore().getFileIds();
}

function readRecentIds(): string[] {
  return getRecentMakePackFileIds();
}
