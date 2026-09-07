import { YardCoreError } from "../errors/yard-core-error";
import type { YardExtensionContext } from "./extension-context";

export type YardExtensionCategory =
  | "workflow"
  | "cleanup"
  | "rename"
  | "export"
  | "metadata"
  | "drop"
  | "collection"
  | "search"
  | "utility";

export type YardCommandScope =
  | "global"
  | "selection"
  | "folder"
  | "file"
  | "collection"
  | "drop";

export type YardContractStanding =
  | "internal"
  | "public-experimental"
  | "public-stable";

export type YardFeatureStatus = "shipped" | "experimental" | "proposed";

/**
 * Version of the intentional extension-host contract (not app version).
 * Contract: internal. Bundled tools are version-matched to the checkout;
 * there is no external compatibility promise yet.
 */
export const YARD_EXTENSION_API_VERSION = 1;

/** API standing of the bundled extension contract. */
export const YARD_EXTENSION_API_STANDING: YardContractStanding = "internal";

export type YardCommandExecutionOwner = "extension-host" | "renderer" | "desktop";

export type YardCommand = {
  id: string;
  title: string;
  description: string;
  scope: YardCommandScope;
  destructive?: boolean;
  requiresSelection?: boolean;
  inputSchema?: YardCommandInputSchema;
  /** Which runtime owns execution. Defaults to extension-host. */
  executionOwner?: YardCommandExecutionOwner;
  /** Semantic capability IDs required for availability (not permissions). */
  requiredCapabilities?: string[];
  /** Documented input reference; validators are functions and never serialized. */
  inputRef?: string;
  resultRef?: string;
  docsId?: string;
};

/** Serializable command metadata. No functions, handlers or validators. */
export type YardCommandDescription = {
  id: string;
  title: string;
  description: string;
  scope: YardCommandScope;
  destructive: boolean;
  requiresSelection: boolean;
  executionOwner: YardCommandExecutionOwner;
  requiredCapabilities: string[];
  input: { kind: "none" | "documented"; ref?: string };
  resultRef?: string;
  docsId: string;
};

/**
 * Define one shared command metadata object consumed by both the manifest
 * declaration and handler registration. Keeps a single source of truth.
 */
export function defineYardCommand(def: YardCommand): YardCommand {
  return { ...def, requiredCapabilities: def.requiredCapabilities ? [...def.requiredCapabilities] : undefined };
}

/** Strip functions from a command into a JSON-safe description. */
export function describeYardCommand(
  command: YardCommand | RegisteredYardCommand,
): YardCommandDescription {
  return {
    id: command.id,
    title: command.title,
    description: command.description,
    scope: command.scope,
    destructive: command.destructive ?? false,
    requiresSelection: command.requiresSelection ?? false,
    executionOwner: command.executionOwner ?? "extension-host",
    requiredCapabilities: command.requiredCapabilities ? [...command.requiredCapabilities] : [],
    input: command.inputSchema
      ? { kind: "documented", ref: command.inputRef }
      : command.inputRef
        ? { kind: "documented", ref: command.inputRef }
        : { kind: "none" },
    ...(command.resultRef ? { resultRef: command.resultRef } : {}),
    docsId: command.docsId ?? "commands",
  };
}

/** Serializable manifest projection (manifests are already plain data). */
export function describeYardManifest(manifest: YardExtensionManifest): YardExtensionManifest {
  return {
    ...manifest,
    permissions: [...manifest.permissions],
    commands: manifest.commands.map((c) => ({ ...c, inputSchema: undefined, requiredCapabilities: c.requiredCapabilities ? [...c.requiredCapabilities] : undefined })),
    settings: manifest.settings?.map((s) => ({ ...s, options: s.options?.map((o) => ({ ...o })) })),
    surfaces: manifest.surfaces ? [...manifest.surfaces] : undefined,
  };
}

export type YardCommandInputSchema = {
  validate(input: unknown): string | null;
};

export function defineYardCommandInputSchema(
  validate: (input: unknown) => string | null,
): YardCommandInputSchema {
  return { validate };
}

export type RegisteredYardCommand = YardCommand & {
  handler?: () => Promise<unknown> | unknown;
};

export class YardCommandValidationError extends YardCoreError {
  constructor(message: string) {
    super(message, "EXTENSION_COMMAND_VALIDATION_FAILED");
    this.name = "YardCommandValidationError";
  }
}

export type YardExtensionManifest = {
  id: string;
  name: string;
  provider: "Foleyard" | "Community";
  version: string;
  description: string;
  category: YardExtensionCategory;
  permissions: YardPermission[];
  commands: YardCommand[];
  settings?: YardSetting[];
  surfaces?: YardSurface[];
};

export type YardPermission =
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

export type PermissionChecker = {
  has(permission: YardPermission): boolean;
  require(permission: YardPermission): void;
  list(): YardPermission[];
};

export class YardPermissionError extends YardCoreError {
  constructor(readonly permission: YardPermission) {
    super(
      `Missing required permission "${permission}".`,
      "EXTENSION_PERMISSION_DENIED",
    );
    this.name = "YardPermissionError";
  }
}

export function createPermissionChecker(
  permissions: YardPermission[],
): PermissionChecker {
  const grantedPermissions = new Set(permissions);

  return {
    has(permission: YardPermission) {
      return grantedPermissions.has(permission);
    },
    require(permission: YardPermission) {
      if (!grantedPermissions.has(permission)) {
        throw new YardPermissionError(permission);
      }
    },
    list() {
      return Array.from(grantedPermissions);
    },
  };
}

export type YardSetting = {
  id: string;
  label: string;
  description?: string;
  type: "boolean" | "string" | "number" | "select" | "path";
  defaultValue: unknown;
  options?: Array<{
    label: string;
    value: string;
  }>;
};

export type YardSurface =
  | "command-palette"
  | "context-menu"
  | "toolbar"
  | "sidebar"
  | "settings"
  | "drop-menu"
  | "selection-actions";

export type YardExtensionDefinition = {
  manifest: YardExtensionManifest;
  registerCommands?: (context: YardExtensionContext) => void;
};

export type YardUiIntent<
  TType extends string = string,
  TPayload = unknown,
> = {
  kind: "yard-ui-intent";
  type: TType;
  payload: TPayload;
};

export function createYardUiIntent<TType extends string, TPayload>(
  type: TType,
  payload: TPayload,
): YardUiIntent<TType, TPayload> {
  return { kind: "yard-ui-intent", type, payload };
}

export function isYardUiIntent(value: unknown): value is YardUiIntent {
  return (
    typeof value === "object" &&
    value !== null &&
    "kind" in value &&
    value.kind === "yard-ui-intent" &&
    "type" in value &&
    typeof value.type === "string" &&
    "payload" in value
  );
}

