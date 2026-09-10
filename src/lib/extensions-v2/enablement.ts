import {
  deleteV2SettingsRow,
  listV2SettingsKeys,
  readV2SettingsRow,
  writeV2SettingsRow,
} from "./settings-state";
import { setV2Approval } from "./policy";
import type { ExtensionV2Permission } from "@yard-core";

/**
 * Persisted v2 enablement + v1 retirement adoption (Application context).
 *
 * The v2 enabled set used to be memory-only, so enablement reset on every
 * boot. This module owns the persisted row per extension
 * (`v2:enablement:<id>`, host-owned like `v2:approvals` and
 * `v2:jobs:snapshot`) and the one-time adoption of enablement and
 * approvals from retired v1 tools.
 *
 * Adoption is per tool: only ids in `RETIRED_V1_TO_V2` are touched. For a
 * retired pair, the first boot after retirement finds the v2 row absent
 * and the v1 `extension:<id>:enabled` row present, adopts the value
 * (persisting the v2 row and deleting the v1 row), and grants the v2
 * tool's declared permissions when the tool was enabled, because v2
 * execution denies without approval. A second boot finds no v1 row, so
 * adoption never runs twice. Tools not yet retired keep their v1 rows
 * untouched.
 */

const ENABLEMENT_PREFIX = "v2:enablement:";

function enablementKey(extensionId: string): string {
  return `${ENABLEMENT_PREFIX}${extensionId}`;
}

/** v1 tool id → v2 port id. All six v1 tools have retired. */
export const RETIRED_V1_TO_V2: Record<string, string> = {
  "smart-collections": "smart-collections-v2",
  "make-pack": "make-pack-v2",
  "drop-rules": "drop-rules-v2",
  "library-gatherer": "library-gatherer-v2",
  "sound-shelf": "sound-shelf-v2",
  "folder-janitor": "folder-janitor-v2",
};

/**
 * v1 setting id → v2 setting id per retired tool, for settings whose names
 * match between ports. Only listed settings are adopted; unlisted v1
 * settings rows stay behind for inspection and are removed with the tool.
 */
export const RETIRED_V1_SETTINGS: Record<string, Record<string, string>> = {
  "make-pack": {
    "default-format": "make-pack-v2.default-format",
    "include-manifest": "make-pack-v2.include-manifest",
  },
  "drop-rules": {
    "copy-on-drop": "drop-rules-v2.copy-on-drop",
    "rename-on-drop": "drop-rules-v2.rename-on-drop",
    "rename-pattern": "drop-rules-v2.rename-pattern",
    "drag-out-folder": "drop-rules-v2.drag-out-folder",
    "mark-used": "drop-rules-v2.mark-used",
  },
  "library-gatherer": {
    "preserve-folder-names": "library-gatherer-v2.preserve-folder-names",
    "skip-duplicates": "library-gatherer-v2.skip-duplicates",
  },
  "folder-janitor": {
    "tiny-file-threshold-bytes": "folder-janitor-v2.tiny-file-threshold-bytes",
    "allowed-formats": "folder-janitor-v2.allowed-formats",
  },
};

/** Persisted value for one extension; undefined when never written. */
export function readPersistedEnabled(extensionId: string): boolean | undefined {
  const stored = readV2SettingsRow(enablementKey(extensionId));
  return typeof stored === "boolean" ? stored : undefined;
}

export function writePersistedEnabled(extensionId: string, enabled: boolean): void {
  writeV2SettingsRow(enablementKey(extensionId), enabled);
}

export function listPersistedEnabled(): string[] {
  return listV2SettingsKeys(ENABLEMENT_PREFIX).map((key) => key.slice(ENABLEMENT_PREFIX.length));
}

/**
 * One-time adoption of enablement and approvals from retired v1 tools.
 * `declaredPermissions` resolves the v2 tool's declared permission set so
 * an adopted enablement is executable (v2 denies without approval).
 */
export function adoptRetiredV1Enablement(
  declaredPermissions: (v2ExtensionId: string) => readonly ExtensionV2Permission[],
): void {
  for (const [v1Id, v2Id] of Object.entries(RETIRED_V1_TO_V2)) {
    const v1Key = `extension:${v1Id}:enabled`;
    const stored = readV2SettingsRow(v1Key);
    if (stored !== undefined) {
      // Adopt only when the v2 port has no enablement of its own yet; a
      // later explicit v2 choice is never overridden. The v1 row goes
      // either way: the tool is retired and nothing reads it again.
      if (readPersistedEnabled(v2Id) === undefined) {
        const enabled = stored === "true" || stored === true;
        writePersistedEnabled(v2Id, enabled);
        if (enabled) {
          setV2Approval(v2Id, declaredPermissions(v2Id));
        }
      }
      deleteV2SettingsRow(v1Key);
    }
  }
  adoptRetiredV1Settings();
  adoptRetiredV1Data();
  adoptRetiredShelfData();
}

/**
 * One-time adoption of listed v1 settings onto the v2 namespace. A v2 row
 * already present is never overridden; the v1 row is deleted once adopted.
 */
function adoptRetiredV1Settings(): void {
  for (const [v1Id, v2Id] of Object.entries(RETIRED_V1_TO_V2)) {
    const mapping = RETIRED_V1_SETTINGS[v1Id];
    if (!mapping) continue;
    for (const [v1SettingId, v2SettingId] of Object.entries(mapping)) {
      const v1Key = `extension:${v1Id}:setting:${v1SettingId}`;
      const v2Key = `extension:${v2Id}:setting:${v2SettingId}`;
      const stored = readV2SettingsRow(v1Key);
      if (stored === undefined) continue;
      // Write only when the v2 row is absent; the v1 row goes either way.
      if (readV2SettingsRow(v2Key) === undefined) {
        writeV2SettingsRow(v2Key, stored);
      }
      deleteV2SettingsRow(v1Key);
    }
  }
}

/** v1 data key → v2 data key per retired tool, adopted once and deleted. */
export const RETIRED_V1_DATA: Record<string, Record<string, string>> = {
  "make-pack": {
    "extension:make-pack:recent": "v2:recent-files",
  },
};

function adoptRetiredV1Data(): void {
  for (const mappings of Object.values(RETIRED_V1_DATA)) {
    for (const [v1Key, v2Key] of Object.entries(mappings)) {
      const stored = readV2SettingsRow(v1Key);
      if (stored === undefined) continue;
      if (readV2SettingsRow(v2Key) === undefined) {
        writeV2SettingsRow(v2Key, stored);
      }
      deleteV2SettingsRow(v1Key);
    }
  }
}

/**
 * One-time adoption of the retired v1 Sound Shelf contents onto the v2
 * shelf store. Shapes differ (`{ fileIds }` vs `{ ids }`), so this is
 * not a blind key copy: v1 ids move only when the v2 shelf is empty,
 * and the v1 row is deleted either way since the retired tool never
 * reads it again.
 */
function adoptRetiredShelfData(): void {
  const v1Key = "extension:sound-shelf:items";
  const v2Key = "v2shelf:sound-shelf-v2";
  const stored = readV2SettingsRow(v1Key) as { fileIds?: unknown } | null | undefined;
  if (stored === undefined || stored === null) return;
  const ids = Array.isArray(stored.fileIds)
    ? stored.fileIds.filter((id): id is string => typeof id === "string" && id.length > 0)
    : [];
  const existing = readV2SettingsRow(v2Key) as { ids?: unknown } | null | undefined;
  if (!Array.isArray(existing?.ids) && ids.length > 0) {
    writeV2SettingsRow(v2Key, { ids });
  }
  deleteV2SettingsRow(v1Key);
}