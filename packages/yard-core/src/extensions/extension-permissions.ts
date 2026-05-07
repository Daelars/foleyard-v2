import { YardCoreError } from "../errors/yard-core-error";

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
        throw new YardCoreError(
          `Missing required permission "${permission}".`,
        );
      }
    },
    list() {
      return Array.from(grantedPermissions);
    },
  };
}
