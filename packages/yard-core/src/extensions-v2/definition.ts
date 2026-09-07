import { YardCoreError } from "../errors/yard-core-error";

/**
 * Framework-free v2 extension definition contracts (Yard Core context).
 * Pure data: no React, no routes, no database handles, no handlers. The
 * registry validates these definitions and the catalog serializes them;
 * execution lives in later tickets (#166+).
 */

export type ExtensionV2Permission =
  | "library:read"
  | "library:write"
  | "files:read"
  | "files:write"
  | "files:copy"
  | "files:rename"
  | "files:delete"
  | "collections:read"
  | "collections:write"
  | "tags:read"
  | "tags:write"
  | "favorites:read"
  | "favorites:write"
  | "desktop:reveal"
  | "desktop:open"
  | "drop:read"
  | "drop:modify"
  | "settings:read"
  | "settings:write";

/** Every permission string the v2 registry recognizes. */
export const KNOWN_V2_PERMISSIONS: readonly ExtensionV2Permission[] = [
  "library:read",
  "library:write",
  "files:read",
  "files:write",
  "files:copy",
  "files:rename",
  "files:delete",
  "collections:read",
  "collections:write",
  "tags:read",
  "tags:write",
  "favorites:read",
  "favorites:write",
  "desktop:reveal",
  "desktop:open",
  "drop:read",
  "drop:modify",
  "settings:read",
  "settings:write",
];

export function isKnownV2Permission(
  value: unknown,
): value is ExtensionV2Permission {
  return (
    typeof value === "string" &&
    (KNOWN_V2_PERMISSIONS as readonly string[]).includes(value)
  );
}

export type ExtensionV2CommandScope =
  | "global"
  | "selection"
  | "folder"
  | "file"
  | "collection"
  | "drop";

export const KNOWN_V2_COMMAND_SCOPES: readonly ExtensionV2CommandScope[] = [
  "global",
  "selection",
  "folder",
  "file",
  "collection",
  "drop",
];

/**
 * Machine-readable value schemas. Deliberately small: only the concrete
 * shapes the reference extension and fixtures need. Schemas are data, so
 * they validate untrusted input at runtime and serialize into catalogs.
 */
export type ExtensionV2ValueSchema =
  | {
      kind: "string";
      minLength?: number;
      maxLength?: number;
      pattern?: string;
      default?: string;
    }
  | {
      kind: "number";
      min?: number;
      max?: number;
      integer?: boolean;
      default?: number;
    }
  | { kind: "boolean"; default?: boolean }
  | { kind: "enum"; values: string[]; default?: string }
  | {
      kind: "string-array";
      minItems?: number;
      maxItems?: number;
      default?: string[];
    }
  | {
      kind: "object";
      properties: Record<string, ExtensionV2ValueSchema>;
      required?: string[];
    }
  | { kind: "none" };

export const KNOWN_V2_SCHEMA_KINDS: readonly string[] = [
  "string",
  "number",
  "boolean",
  "enum",
  "string-array",
  "object",
  "none",
];

/** Structural check used at registration; returns a reason or null. */
export function checkV2SchemaShape(
  schema: unknown,
  path: string,
): string | null {
  if (typeof schema !== "object" || schema === null) {
    return `${path} must be an object.`;
  }
  const kind = (schema as { kind?: unknown }).kind;
  if (typeof kind !== "string" || !KNOWN_V2_SCHEMA_KINDS.includes(kind)) {
    return `${path} has unsupported schema kind ${JSON.stringify(kind)}. Supported kinds: ${KNOWN_V2_SCHEMA_KINDS.join(", ")}.`;
  }
  if (kind === "enum") {
    const values = (schema as { values?: unknown }).values;
    if (!Array.isArray(values) || values.length === 0) {
      return `${path} is an enum schema with no values; declare at least one allowed value.`;
    }
    if (values.some((value) => typeof value !== "string" || !value)) {
      return `${path} has an empty enum value; every value must be a non-empty string.`;
    }
    const def = (schema as { default?: unknown }).default;
    if (def !== undefined && !values.includes(def as string)) {
      return `${path} defaults to ${JSON.stringify(def)} which is not one of its values.`;
    }
  }
  if (kind === "object") {
    const properties = (schema as { properties?: unknown }).properties;
    if (
      typeof properties !== "object" ||
      properties === null ||
      Array.isArray(properties)
    ) {
      return `${path} is an object schema without a properties record.`;
    }
    for (const [name, nested] of Object.entries(properties)) {
      const nestedError = checkV2SchemaShape(nested, `${path}.${name}`);
      if (nestedError) return nestedError;
    }
    const required = (schema as { required?: unknown }).required;
    if (required !== undefined) {
      if (
        !Array.isArray(required) ||
        required.some((name) => typeof name !== "string" || !(name in properties))
      ) {
        return `${path} lists a required property that is not declared in properties.`;
      }
    }
  }
  if (kind === "string") {
    const pattern = (schema as { pattern?: unknown }).pattern;
    if (pattern !== undefined) {
      if (typeof pattern !== "string") {
        return `${path} has a non-string pattern.`;
      }
      try {
        new RegExp(pattern);
      } catch {
        return `${path} has a pattern that is not a valid regular expression.`;
      }
    }
  }
  return null;
}

/**
 * Validate untrusted runtime input against a schema. Returns null when
 * valid, otherwise a human-readable reason for rejection.
 */
export function validateV2Value(
  schema: ExtensionV2ValueSchema,
  value: unknown,
  path = "input",
): string | null {
  switch (schema.kind) {
    case "none":
      return value === null || value === undefined
        ? null
        : `${path} accepts no input; got ${typeof value}.`;
    case "string": {
      if (typeof value !== "string") return `${path} must be a string.`;
      if (schema.minLength !== undefined && value.length < schema.minLength) {
        return `${path} must be at least ${schema.minLength} characters.`;
      }
      if (schema.maxLength !== undefined && value.length > schema.maxLength) {
        return `${path} must be at most ${schema.maxLength} characters.`;
      }
      if (
        schema.pattern !== undefined &&
        !new RegExp(schema.pattern).test(value)
      ) {
        return `${path} does not match the expected format.`;
      }
      return null;
    }
    case "number": {
      if (typeof value !== "number" || !Number.isFinite(value)) {
        return `${path} must be a finite number.`;
      }
      if (schema.integer === true && !Number.isInteger(value)) {
        return `${path} must be an integer.`;
      }
      if (schema.min !== undefined && value < schema.min) {
        return `${path} must be at least ${schema.min}.`;
      }
      if (schema.max !== undefined && value > schema.max) {
        return `${path} must be at most ${schema.max}.`;
      }
      return null;
    }
    case "boolean":
      return typeof value === "boolean"
        ? null
        : `${path} must be a boolean.`;
    case "enum":
      return typeof value === "string" && schema.values.includes(value)
        ? null
        : `${path} must be one of: ${schema.values.join(", ")}.`;
    case "string-array": {
      if (!Array.isArray(value)) return `${path} must be an array of strings.`;
      if (
        schema.minItems !== undefined &&
        value.length < schema.minItems
      ) {
        return `${path} needs at least ${schema.minItems} item(s).`;
      }
      if (
        schema.maxItems !== undefined &&
        value.length > schema.maxItems
      ) {
        return `${path} accepts at most ${schema.maxItems} item(s).`;
      }
      const badIndex = value.findIndex(
        (item) => typeof item !== "string",
      );
      return badIndex === -1
        ? null
        : `${path}[${badIndex}] must be a string.`;
    }
    case "object": {
      if (typeof value !== "object" || value === null || Array.isArray(value)) {
        return `${path} must be an object.`;
      }
      const record = value as Record<string, unknown>;
      for (const name of schema.required ?? []) {
        if (record[name] === undefined) {
          return `${path} is missing required property "${name}".`;
        }
      }
      for (const [name, nested] of Object.entries(schema.properties)) {
        if (record[name] === undefined) continue;
        const nestedError = validateV2Value(nested, record[name], `${path}.${name}`);
        if (nestedError) return nestedError;
      }
      return null;
    }
  }
}

export type ExtensionV2Command = {
  id: string;
  title: string;
  description: string;
  scope: ExtensionV2CommandScope;
  destructive?: boolean;
  requiresSelection?: boolean;
  input?: ExtensionV2ValueSchema;
  result?: ExtensionV2ValueSchema;
  requiredCapabilities?: string[];
  docsId?: string;
};

export type ExtensionV2SettingType =
  | "boolean"
  | "string"
  | "number"
  | "enum"
  | "path";

export type ExtensionV2Setting = {
  id: string;
  label: string;
  description?: string;
  type: ExtensionV2SettingType;
  defaultValue: unknown;
  options?: Array<{ label: string; value: string }>;
};

export const KNOWN_V2_SETTING_TYPES: readonly ExtensionV2SettingType[] = [
  "boolean",
  "string",
  "number",
  "enum",
  "path",
];

/** Largest accepted string/path setting value, in UTF-8 bytes. */
export const MAX_V2_SETTING_STRING_BYTES = 4_096;

/**
 * Validate one setting value against its author declaration. Returns
 * null when valid, otherwise a human-readable reason. Used by the
 * operation services and the R7 settings store.
 */
export function validateV2SettingValue(
  setting: ExtensionV2Setting,
  value: unknown,
): string | null {
  switch (setting.type) {
    case "boolean":
      return typeof value === "boolean" ? null : `Setting "${setting.id}" must be a boolean.`;
    case "number":
      return typeof value === "number" && Number.isFinite(value)
        ? null
        : `Setting "${setting.id}" must be a finite number.`;
    case "string":
    case "path": {
      if (typeof value !== "string") return `Setting "${setting.id}" must be a string.`;
      if (setting.type === "path" && !value.trim()) {
        return `Setting "${setting.id}" must be a non-empty path.`;
      }
      if (new TextEncoder().encode(value).length > MAX_V2_SETTING_STRING_BYTES) {
        return `Setting "${setting.id}" exceeds the ${MAX_V2_SETTING_STRING_BYTES}-byte limit.`;
      }
      return null;
    }
    case "enum": {
      const allowed = (setting.options ?? []).map((option) => option.value);
      return typeof value === "string" && allowed.includes(value)
        ? null
        : `Setting "${setting.id}" must be one of: ${allowed.join(", ") || "(no declared options)"}.`;
    }
  }
}

export type ExtensionV2ContributionType =
  | "command-palette"
  | "file-context-menu"
  | "folder-context-menu"
  | "selection-actions"
  | "toolbar"
  | "sidebar"
  | "settings"
  | "drop-menu";

export const KNOWN_V2_CONTRIBUTION_TYPES: readonly ExtensionV2ContributionType[] =
  [
    "command-palette",
    "file-context-menu",
    "folder-context-menu",
    "selection-actions",
    "toolbar",
    "sidebar",
    "settings",
    "drop-menu",
  ];

export type ExtensionV2Contribution = {
  id: string;
  type: ExtensionV2ContributionType;
  commandId: string;
  title?: string;
  order?: number;
};

export type ExtensionV2DocsRef = {
  id: string;
  title: string;
};

export type ExtensionV2CommandRef = {
  commandId: string;
};

export type ExtensionV2Lifecycle = {
  onEnabled?: ExtensionV2CommandRef;
  onDisabled?: ExtensionV2CommandRef;
};

export type ExtensionV2Definition = {
  /** Namespace owner, e.g. `make-pack-v2`. Lowercase letters, digits, hyphens. */
  id: string;
  name: string;
  /** Author's own package release, `major.minor.patch`. */
  version: string;
  /** v2 contract targeted; see version.ts for compatibility rules. */
  apiVersion: number;
  description: string;
  permissions: ExtensionV2Permission[];
  commands: ExtensionV2Command[];
  settings?: ExtensionV2Setting[];
  contributions?: ExtensionV2Contribution[];
  docsRefs?: ExtensionV2DocsRef[];
  lifecycle?: ExtensionV2Lifecycle;
};

export class ExtensionV2DefinitionError extends YardCoreError {
  constructor(message: string) {
    super(message, "EXTENSION_V2_DEFINITION_INVALID");
    this.name = "ExtensionV2DefinitionError";
  }
}
