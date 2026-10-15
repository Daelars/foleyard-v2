import type { ExtensionV2Setting } from "@yard-core";

/**
 * Extension settings data shapes (#246).
 *
 * The generic settings form that used to render these rows was never
 * mounted: the promoted surface renders hand-built settings sections in
 * `src/app/(variant-i)/components/extensions/`, consuming these types.
 */

export type V2SettingRow = {
  declaration: ExtensionV2Setting;
  value: unknown;
};

export type V2ExtensionSettingsEntry = {
  id: string;
  name: string;
  version: string;
  description: string;
  enabled: boolean;
  declaredPermissions: string[];
  effectivePermissions: string[];
  rows: V2SettingRow[];
  /** "degraded" when this extension's settings could not be read; it stays visible with `error`. */
  status: "ready" | "degraded";
  /** Human reason when degraded; null when ready. */
  error: string | null;
};
