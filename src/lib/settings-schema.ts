/**
 * Settings schema discovery (values excluded).
 * Feature status: shipped. Contract: internal.
 * Reuses extension YardSetting definitions and known renderer preferences.
 * Schema discovery never returns sensitive values or library paths.
 */

export type SettingsOwner = "sqlite-settings" | "extension-kv" | "renderer-localStorage";
export type SettingsScope = "library" | "extension" | "ui";

export type SettingsSchemaEntry = {
  id: string;
  owner: SettingsOwner;
  scope: SettingsScope;
  type: "boolean" | "string" | "number" | "select" | "path";
  defaultValue: unknown;
  options?: Array<{ label: string; value: string }>;
  min?: number;
  max?: number;
  docsId: string;
};

const RENDERER_PREFERENCES: SettingsSchemaEntry[] = [
  { id: "shortcuts.bindings", owner: "renderer-localStorage", scope: "ui", type: "string", defaultValue: "Space,/,f,j,k,,", docsId: "settings" },
  { id: "audio.volume", owner: "renderer-localStorage", scope: "ui", type: "number", defaultValue: 1, min: 0, max: 1, docsId: "settings" },
  { id: "ui.zoom", owner: "renderer-localStorage", scope: "ui", type: "number", defaultValue: 1, min: 0.5, max: 2, docsId: "settings" },
  { id: "ui.remove-default", owner: "renderer-localStorage", scope: "ui", type: "string", defaultValue: "remove", docsId: "settings" },
  { id: "library.roots", owner: "sqlite-settings", scope: "library", type: "string", defaultValue: [], docsId: "settings" },
  { id: "onboarding.version", owner: "sqlite-settings", scope: "library", type: "string", defaultValue: null, docsId: "settings" },
];

export function getRendererSettingsSchema(): SettingsSchemaEntry[] {
  return RENDERER_PREFERENCES.map((s) => ({ ...s }));
}

/** Validate select options and numeric bounds for extension settings. */
export function validateSettingValue(
  schema: { type: string; options?: Array<{ value: string }>; min?: number; max?: number },
  value: unknown,
): string | null {
  if (schema.type === "select" && schema.options) {
    if (typeof value !== "string" || !schema.options.some((o) => o.value === value)) {
      return "value is not one of the allowed options";
    }
  }
  if (schema.type === "number" && typeof value === "number") {
    if (schema.min !== undefined && value < schema.min) return `value below minimum ${schema.min}`;
    if (schema.max !== undefined && value > schema.max) return `value above maximum ${schema.max}`;
  }
  return null;
}

export function getSettingsSchemaRefs(): string[] {
  return ["settings.md", "extensions.md#settings", "commands.md", "extensions-v2.md"];
}
