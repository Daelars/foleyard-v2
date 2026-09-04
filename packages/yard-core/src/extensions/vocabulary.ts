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

export type YardCommand = {
  id: string;
  title: string;
  description: string;
  scope: YardCommandScope;
  destructive?: boolean;
  requiresSelection?: boolean;
};

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

