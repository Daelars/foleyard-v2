import type { V2ShelfPorts } from "@yard-core";

import { getV2Events } from "./events";
import { readV2SettingsRow, writeV2SettingsRow } from "./settings-state";

/**
 * Application shelf-store ports for v2 operations (Application
 * context, E1 #176).
 *
 * One ID list per extension in the existing `settings` table under
 * `v2shelf:<extensionId>` — no new migration, the same pattern the
 * jobs snapshot and approvals already proved (see `docs/database.md`).
 * This is deliberately separate from the v1 Sound Shelf record
 * (`extension:sound-shelf:items`): v2 ports start empty with no
 * auto-migration, the make-pack-v2 precedent. The core shelf service
 * owns repair (pruning unindexed IDs) and per-extension isolation;
 * this module owns storage and notification.
 *
 * Persist-before-notify: the row commits first and `state-changed`
 * emits afterwards, so a subscriber that re-reads on receipt always
 * observes the triggering change. No v1 extension modules imported.
 */

export type V2ShelfDeps = {
  read?: (key: string) => unknown;
  write?: (key: string, value: unknown) => void;
  notify?: (extensionId: string) => void;
};

function shelfKey(extensionId: string): string {
  return `v2shelf:${extensionId}`;
}

function defaultNotify(extensionId: string): void {
  getV2Events().emit("state-changed", extensionId);
}

/** Settings-table shelf rows; pass deps only in tests. */
export function createV2ShelfPorts(deps: V2ShelfDeps = {}): V2ShelfPorts {
  const read = deps.read ?? readV2SettingsRow;
  const write = deps.write ?? writeV2SettingsRow;
  const notify = deps.notify ?? defaultNotify;
  return {
    readIds: (extensionId) => {
      const stored = read(shelfKey(extensionId)) as { ids?: unknown } | null | undefined;
      const ids = stored?.ids;
      if (!Array.isArray(ids)) return [];
      return ids.filter((id): id is string => typeof id === "string" && id.length > 0);
    },
    writeIds: (extensionId, ids) => {
      write(shelfKey(extensionId), { ids: [...ids] });
      notify(extensionId);
    },
  };
}
