import type {
  ExtensionV2CatalogEntry,
  ExtensionV2Permission,
  ExtensionV2Setting,
} from "@yard-core";

/**
 * Batched extension-settings read (Application context, #295).
 *
 * The Settings dialog and the Tools grid used to fan out one
 * `/settings/:id` request per registered extension the moment the dialog
 * mounted (every panel, at once, regardless of which tab was visible).
 * One process-wide read now serves the whole list, so concurrency is
 * bounded to a single request and a slow or failing extension cannot
 * hold up the dialog.
 *
 * Degraded states are explicit, matching the #266 policy pattern: a
 * failed per-extension read, or a stored row that failed validation,
 * stays in the list as a `degraded` entry with a human reason. It is
 * never filtered out into a silently empty panel. Building is pure and
 * injectable so the isolation behavior is testable without a database.
 */

export type V2SettingsRow = {
  declaration: ExtensionV2Setting;
  value: unknown;
};

export type V2SettingsCatalogEntry = {
  id: string;
  name: string;
  version: string;
  description: string;
  enabled: boolean;
  /** Declared permissions (the approval request surface). */
  declaredPermissions: ExtensionV2Permission[];
  /** Effective (declared ∩ approved) permissions the host enforces. */
  effectivePermissions: ExtensionV2Permission[];
  settings: V2SettingsRow[];
  status: "ready" | "degraded";
  /** Human reason when degraded; null when ready. Never a stack trace. */
  error: string | null;
};

export type V2SettingsReadSource = {
  entries: readonly ExtensionV2CatalogEntry[];
  isEnabled: (extensionId: string) => boolean;
  /**
   * Read one extension's declared settings. Returns a `degradedReason`
   * when stored rows fell back to defaults; throws when the read itself
   * failed. Either way the extension stays in the list.
   */
  readSettings: (
    extensionId: string,
    declarations: readonly ExtensionV2Setting[],
  ) => { rows: V2SettingsRow[]; degradedReason: string | null };
};

export function buildV2SettingsCatalog(
  source: V2SettingsReadSource,
): V2SettingsCatalogEntry[] {
  return source.entries.map((entry) => {
    const declared = entry.declaredPermissions ?? entry.permissions;
    const base = {
      id: entry.id,
      name: entry.name,
      version: entry.version,
      description: entry.description,
      enabled: source.isEnabled(entry.id),
      declaredPermissions: [...declared],
      effectivePermissions: [...entry.permissions],
    };
    try {
      const { rows, degradedReason } = source.readSettings(entry.id, entry.settings ?? []);
      return {
        ...base,
        settings: rows,
        status: degradedReason ? "degraded" : "ready",
        error: degradedReason,
      };
    } catch (error) {
      return {
        ...base,
        settings: [],
        status: "degraded",
        error: `Settings for "${entry.name}" could not be read: ${
          error instanceof Error ? error.message : String(error)
        }`,
      };
    }
  });
}
