import {
  YardPermissionError,
  type YardExtensionContext,
  type YardPermission,
} from "@yard-core";

/**
 * Host-owned protected service enforcement.
 * Feature status: shipped. Contract: internal.
 * Wraps context services so access is denied even when an extension omits
 * permissions.require(). Bundled extensions remain trusted Node code —
 * this enforces cooperative service access, not a sandbox against direct
 * Node imports.
 */

const WRITE_PERMISSIONS: YardPermission[] = [
  "library:write",
  "files:write",
  "files:copy",
  "files:rename",
  "files:delete",
  "collections:write",
  "tags:write",
  "favorites:write",
  "settings:write",
  "drop:modify",
];

function hasAll(granted: Set<string>, required: YardPermission[]): boolean {
  return required.every((p) => granted.has(p));
}

function deny(permission: YardPermission): never {
  throw new YardPermissionError(permission);
}

export function createGuardedServices(
  services: YardExtensionContext["services"],
  grantedPermissions: YardPermission[],
): YardExtensionContext["services"] {
  const granted = new Set<string>(grantedPermissions);
  const guarded = { ...services };

  // Filesystem: writable resolution requires files:write or drop:modify.
  if (services.filesystem) {
    const fs = services.filesystem;
    guarded.filesystem = {
      resolveReadablePath: fs.resolveReadablePath,
      resolveWritablePath: async (candidate: string) => {
        if (!hasAll(granted, ["files:write"]) && !granted.has("drop:modify")) {
          deny("files:write");
        }
        return fs.resolveWritablePath(candidate);
      },
    };
  }

  // Library mutations: require library:write.
  if (services.library) {
    const lib = services.library as unknown as Record<string, unknown>;
    guarded.library = new Proxy(lib as object, {
      get(target, prop, receiver) {
        const value = Reflect.get(target, prop, receiver);
        if (typeof value !== "function") return value;
        const name = String(prop);
        // Read-ish methods pass through; mutations require library:write.
        if (/^(get|list|find|search|count|status)/i.test(name)) {
          return (value as (...a: unknown[]) => unknown).bind(target);
        }
        return (...args: unknown[]) => {
          if (!granted.has("library:write")) deny("library:write");
          return (value as (...a: unknown[]) => unknown).apply(target, args);
        };
      },
    }) as YardExtensionContext["services"]["library"];
  }

  // Files markRemoved requires files:write (index mutation via file service).
  if (services.files) {
    const files = services.files;
    guarded.files = {
      markRemoved: (fileIds: string[]) => {
        if (!granted.has("files:write") && !granted.has("library:write")) deny("files:write");
        return files.markRemoved(fileIds);
      },
    };
  }

  // Collections/tags/favorites mutations require their write permission.
  const guardService = <T extends object>(
    svc: T | undefined,
    readPrefix: string,
    writePermission: YardPermission,
  ): T | undefined => {
    if (!svc) return svc;
    return new Proxy(svc as object, {
      get(target, prop, receiver) {
        const value = Reflect.get(target, prop, receiver);
        if (typeof value !== "function") return value;
        if (new RegExp(`^(${readPrefix}|get|list|find)`, "i").test(String(prop))) {
          return (value as (...a: unknown[]) => unknown).bind(target);
        }
        return (...args: unknown[]) => {
          if (!granted.has(writePermission)) deny(writePermission);
          return (value as (...a: unknown[]) => unknown).apply(target, args);
        };
      },
    }) as T;
  };

  guarded.collections = guardService(services.collections, "get|list|find|read", "collections:write");
  guarded.tags = guardService(services.tags, "get|list|find|read", "tags:write");
  guarded.favorites = guardService(services.favorites, "get|list|find|is|read", "favorites:write");

  void WRITE_PERMISSIONS;
  return guarded;
}

/** Effective permissions = requested ∩ host-enforced policy (no grant tokens). */
export function effectivePermissions(
  requested: YardPermission[],
  hostPolicy: YardPermission[],
): YardPermission[] {
  const allowed = new Set(hostPolicy);
  return requested.filter((p) => allowed.has(p));
}
