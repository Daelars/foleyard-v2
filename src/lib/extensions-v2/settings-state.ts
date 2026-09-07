import { eq } from "drizzle-orm";

import { db } from "@/lib/database/connection";
import { settings } from "@/lib/schema";
import {
  V2AuthoredSettingsStore,
  V2WorkflowStateStore,
  type ExtensionV2Setting,
  type V2ExtensionStatePorts,
  type V2SettingsPorts,
} from "@yard-core";

import { getV2Events } from "./events";

/**
 * Application settings/state ports for v2 operations (Application
 * context, R7).
 *
 * Reuses database infrastructure directly (the settings table, no new
 * migration — the same pattern the jobs snapshot already proved) without
 * importing v1 extension modules. Settings rows are namespaced per
 * extension by the core services; state is one versioned envelope per
 * extension (`V2WorkflowStateStore` reads legacy unversioned blobs as
 * version 0); approvals persist under `v2:approvals` (see `policy.ts`).
 *
 * Persist-before-notify: every write commits its settings-table row
 * first and emits its typed event afterwards, so a subscriber that
 * re-reads on receipt always observes the triggering change. Only
 * `extension:*:setting:*` rows emit `settings-changed` and only
 * `v2state:*` blobs emit `state-changed`; v1 rows and host-owned keys
 * (`v2:jobs:snapshot`, `v2:approvals`) never emit through these ports.
 */

function readRow(key: string): unknown {
  const row = db.select().from(settings).where(eq(settings.key, key)).get();
  if (!row?.value) return undefined;
  try {
    return JSON.parse(row.value) as unknown;
  } catch {
    return undefined;
  }
}

function writeRow(key: string, value: unknown): void {
  const serialized = JSON.stringify(value);
  const updatedAt = new Date().toISOString();
  db.insert(settings)
    .values({ key, value: serialized, updatedAt })
    .onConflictDoUpdate({ target: settings.key, set: { value: serialized, updatedAt } })
    .run();
}

/** Raw row access for adapters that own their key format (approvals, jobs snapshot). */
export function readV2SettingsRow(key: string): unknown {
  return readRow(key);
}

/** Raw row write without event emission; the owning adapter emits its own typed event. */
export function writeV2SettingsRow(key: string, value: unknown): void {
  writeRow(key, value);
}

const SETTING_ROW_PATTERN = /^extension:([^:]+):setting:(.+)$/;

/** Raw namespaced settings rows; the core services enforce ownership. Emits after persist. */
export function createV2SettingsPorts(): V2SettingsPorts {
  return {
    readRaw: (key) => readRow(key),
    writeRaw: (key, value) => {
      writeRow(key, value);
      const match = SETTING_ROW_PATTERN.exec(key);
      if (match) {
        getV2Events().emit("settings-changed", match[1] as string, { keys: [match[2] as string] });
      }
    },
  };
}

/** Extension-scoped state blobs; the core services enforce ownership. Emits after persist. */
export function createV2ExtensionStatePorts(): V2ExtensionStatePorts {
  return {
    readAll: (extensionId) => {
      const stored = readRow(`v2state:${extensionId}`);
      return typeof stored === "object" && stored !== null
        ? (stored as Record<string, unknown>)
        : {};
    },
    writeAll: (extensionId, state) => {
      writeRow(`v2state:${extensionId}`, state);
      getV2Events().emit("state-changed", extensionId);
    },
  };
}

/**
 * Validated author-declared settings for one extension. Reads and
 * writes validate against the registry declarations; corrupt rows read
 * as defaults (see `diagnose`). Writes flow through the emitting ports,
 * so notification still follows persistence.
 */
export function createV2AuthoredSettings(
  extensionId: string,
  declarations: readonly ExtensionV2Setting[],
): V2AuthoredSettingsStore {
  return new V2AuthoredSettingsStore(extensionId, declarations, createV2SettingsPorts());
}

/** Versioned workflow state with transactional migrations (see core `V2WorkflowStateStore`). */
export function createV2WorkflowState(extensionId: string): V2WorkflowStateStore {
  return new V2WorkflowStateStore(extensionId, createV2ExtensionStatePorts());
}
