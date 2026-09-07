import { YardCoreError } from "../errors/yard-core-error";

import type {
  ExtensionV2Command,
  ExtensionV2Contribution,
  ExtensionV2Definition,
  ExtensionV2DocsRef,
  ExtensionV2Permission,
  ExtensionV2Setting,
  ExtensionV2ValueSchema,
} from "./definition";
import { SUPPORTED_V2_API_VERSIONS } from "./version";

/**
 * Serializable catalog projection. The catalog is derived from registered
 * definitions and contains data only: any function (handler, validator,
 * callback) is a leakage bug, and the serializer below throws on it
 * instead of letting JSON silently drop the key.
 */

export type ExtensionV2CatalogCommand = {
  id: string;
  title: string;
  description: string;
  scope: ExtensionV2Command["scope"];
  destructive: boolean;
  requiresSelection: boolean;
  input?: ExtensionV2ValueSchema;
  result?: ExtensionV2ValueSchema;
  requiredCapabilities: string[];
  docsId: string;
};

export type ExtensionV2CatalogEntry = {
  id: string;
  name: string;
  version: string;
  description: string;
  permissions: ExtensionV2Permission[];
  commands: ExtensionV2CatalogCommand[];
  settings: ExtensionV2Setting[];
  contributions: ExtensionV2Contribution[];
  docsRefs: ExtensionV2DocsRef[];
};

export type ExtensionV2Catalog = {
  apiVersion: number;
  entries: ExtensionV2CatalogEntry[];
};

export class ExtensionV2CatalogError extends YardCoreError {
  constructor(
    message: string,
    readonly path: string,
  ) {
    super(message, "EXTENSION_V2_CATALOG_INVALID");
    this.name = "ExtensionV2CatalogError";
    this.path = path;
  }
}

function formatPath(path: string): string {
  return path === "$" ? "catalog" : path.replace(/^\$\.?/, "");
}

/**
 * Throw when `value` holds anything JSON cannot represent faithfully.
 * Functions are the critical case: `JSON.stringify` drops object function
 * values (and nulls array ones) without warning, so a silent catalog
 * would hide leaked handlers. Undefined, symbols, and bigints are
 * rejected for the same reason.
 */
export function assertJsonSerializable(value: unknown, path = "$"): void {
  const fail = (reason: string, at: string): never => {
    throw new ExtensionV2CatalogError(
      `Catalog value at ${formatPath(at)} is not serializable: ${reason}. Handlers and validators must stay out of definitions; keep functions in host-side code.`,
      formatPath(at),
    );
  };
  if (typeof value === "function") {
    fail("a function value would be silently dropped by JSON", path);
  }
  if (typeof value === "symbol" || typeof value === "bigint") {
    fail(`a ${typeof value} value has no JSON representation`, path);
  }
  if (value === undefined) {
    fail("undefined has no JSON representation", path);
  }
  if (typeof value !== "object" || value === null) {
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      assertJsonSerializable(item, `${path}[${index}]`),
    );
    return;
  }
  for (const [key, entry] of Object.entries(value)) {
    assertJsonSerializable(entry, path === "$" ? key : `${path}.${key}`);
  }
}

/** Drop `undefined`-valued keys: JSON would silently drop them while the serializer rejects them. */
function withoutUndefined<T extends Record<string, unknown>>(record: T): T {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (value !== undefined) out[key] = value;
  }
  return out as T;
}

/** Project one validated definition to its serializable catalog entry. */
export function toCatalogEntry(
  definition: ExtensionV2Definition,
): ExtensionV2CatalogEntry {
  const entry: ExtensionV2CatalogEntry = {
    id: definition.id,
    name: definition.name,
    version: definition.version,
    description: definition.description,
    permissions: [...definition.permissions],
    commands: definition.commands.map((command) => ({
      id: command.id,
      title: command.title,
      description: command.description,
      scope: command.scope,
      destructive: command.destructive ?? false,
      requiresSelection: command.requiresSelection ?? false,
      ...(command.input !== undefined ? { input: command.input } : {}),
      ...(command.result !== undefined ? { result: command.result } : {}),
      requiredCapabilities: command.requiredCapabilities
        ? [...command.requiredCapabilities]
        : [],
      docsId: command.docsId ?? "commands",
    })),
    // Optional fields stay absent (not explicit `undefined`) when
    // undeclared: the serializer below rejects `undefined` instead of
    // letting JSON silently drop the key.
    settings: (definition.settings ?? []).map((setting) =>
      withoutUndefined({
        ...setting,
        ...(setting.options !== undefined
          ? { options: setting.options.map((option) => ({ ...option })) }
          : {}),
      }),
    ),
    contributions: (definition.contributions ?? []).map((contribution) =>
      withoutUndefined({ ...contribution }),
    ),
    docsRefs: (definition.docsRefs ?? []).map((docsRef) => ({ ...docsRef })),
  };
  assertJsonSerializable(entry, "$");
  return JSON.parse(JSON.stringify(entry)) as ExtensionV2CatalogEntry;
}

/** Serialize a catalog, throwing on non-serializable leakage. */
export function serializeCatalog(catalog: unknown): string {
  assertJsonSerializable(catalog, "$");
  return JSON.stringify(catalog);
}

/** Parse and shape-check a catalog envelope. */
export function parseCatalog(json: string): ExtensionV2Catalog {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new ExtensionV2CatalogError(
      "Catalog payload is not valid JSON.",
      "catalog",
    );
  }
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !Array.isArray((parsed as { entries?: unknown }).entries)
  ) {
    throw new ExtensionV2CatalogError(
      'Catalog envelope must be an object with an "entries" array.',
      "catalog",
    );
  }
  const apiVersion = (parsed as { apiVersion?: unknown }).apiVersion;
  if (
    typeof apiVersion !== "number" ||
    !(SUPPORTED_V2_API_VERSIONS as readonly number[]).includes(apiVersion)
  ) {
    throw new ExtensionV2CatalogError(
      `Catalog apiVersion ${JSON.stringify(apiVersion)} is not supported; supported v2 versions: ${SUPPORTED_V2_API_VERSIONS.join(", ")}.`,
      "catalog.apiVersion",
    );
  }
  assertJsonSerializable(parsed, "$");
  return parsed as ExtensionV2Catalog;
}
