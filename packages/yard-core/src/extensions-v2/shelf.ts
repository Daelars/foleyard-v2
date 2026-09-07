import type { ExtensionV2Permission } from "./definition";
import { V2OperationError } from "./operations";

/**
 * Shelf store operations for v2 handlers (Yard Core context, E1 #176).
 *
 * Sound Shelf v2 keeps a short-term scratchpad of Library sounds —
 * explicit add/remove/clear/list, never favorites, never a smart
 * Collection. The store holds index IDs; every read repairs itself by
 * pruning IDs that left the Library index (removed or unknown records
 * are dropped and the repaired list is written back, so the scratchpad
 * never accumulates dead entries). Adds validate before writing: an
 * ID outside the Library index rejects the whole call and nothing is
 * stored.
 *
 * All four commands sit behind `library:read`, matching the v1 Sound
 * Shelf permission. Every method checks the invocation's effective
 * permissions first. Each extension owns its own shelf: the ports key
 * rows per extension ID, so one extension can never read another
 * extension's scratchpad.
 *
 * Framework-free: no database handles, no v1 imports.
 */

/** Largest scratchpad the shelf service accepts in one store. */
export const V2_MAX_SHELF_IDS = 2_000;

/** Extension-namespaced ID list storage. */
export type V2ShelfPorts = {
  readIds(extensionId: string): string[];
  writeIds(extensionId: string, ids: string[]): void;
};

export type V2ShelfOperations = {
  /** Current IDs with unindexed entries pruned and written back. */
  list(): { ids: string[]; repaired: string[] };
  add(ids: string[]): { added: number; total: number };
  remove(ids: string[]): { removed: number; total: number };
  clear(): { removed: number };
};

export type V2ShelfFactoryArgs = {
  extensionId: string;
  effectivePermissions: readonly string[];
  shelf?: V2ShelfPorts;
  /** Live index lookup used for repair and add validation. */
  isLiveFile?(fileId: string): boolean;
  /** Called after each persisted change, never before. */
  notify?: (scope: "shelf") => void;
};

function denied(permission: string, extensionId: string): V2OperationError {
  return new V2OperationError(
    "permission-denied",
    `Extension "${extensionId}" lacks the "${permission}" permission for this operation; grant it to use this command.`,
  );
}

function unsupported(extensionId: string): V2OperationError {
  return new V2OperationError(
    "input-invalid",
    `The shelf store is not supported by this host binding; extension "${extensionId}" cannot reach it here.`,
  );
}

function cleanIds(ids: readonly unknown[], limit: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    if (typeof id !== "string" || !id.trim()) {
      throw new V2OperationError("input-invalid", "Shelf IDs must be non-empty strings.");
    }
    if (!seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  if (out.length > limit) {
    throw new V2OperationError(
      "input-invalid",
      `This shelf holds ${out.length} sounds; the scratchpad limit is ${limit}. Remove sounds before adding more.`,
    );
  }
  return out;
}

/** Shelf store bound to one invocation. See the module docblock for the permission map. */
export function createV2ShelfOperations(args: V2ShelfFactoryArgs): V2ShelfOperations {
  const effective = new Set(args.effectivePermissions);

  const require = (permission: ExtensionV2Permission): void => {
    if (!effective.has(permission)) throw denied(permission, args.extensionId);
  };

  const ports = (): V2ShelfPorts => {
    if (!args.shelf) throw unsupported(args.extensionId);
    return args.shelf;
  };

  const live = (fileId: string): boolean => (args.isLiveFile ? args.isLiveFile(fileId) : true);

  return {
    list(): { ids: string[]; repaired: string[] } {
      require("library:read");
      const stored = ports().readIds(args.extensionId);
      const ids = stored.filter((id) => typeof id === "string" && id.length > 0);
      const repaired = ids.filter((id) => !live(id));
      if (repaired.length > 0) {
        const kept = ids.filter((id) => live(id));
        // Persist the repaired list first; only notify after it lands.
        ports().writeIds(args.extensionId, kept);
        args.notify?.("shelf");
        return { ids: kept, repaired };
      }
      return { ids, repaired: [] };
    },
    add(ids: string[]): { added: number; total: number } {
      require("library:read");
      const requested = cleanIds(ids, V2_MAX_SHELF_IDS);
      if (requested.length === 0) {
        throw new V2OperationError("input-invalid", "Add at least one sound to the shelf.");
      }
      const outside = requested.filter((id) => !live(id));
      if (outside.length > 0) {
        throw new V2OperationError(
          "input-invalid",
          `Sound(s) ${outside.map((id) => JSON.stringify(id)).join(", ")} are not in the Library index; nothing was added. Refresh the selection and retry.`,
        );
      }
      const current = ports().readIds(args.extensionId);
      const known = new Set(current);
      const next = [...current];
      let added = 0;
      for (const id of requested) {
        if (!known.has(id)) {
          known.add(id);
          next.push(id);
          added += 1;
        }
      }
      if (next.length > V2_MAX_SHELF_IDS) {
        throw new V2OperationError(
          "input-invalid",
          `This shelf would hold ${next.length} sounds; the scratchpad limit is ${V2_MAX_SHELF_IDS}. Remove sounds before adding more.`,
        );
      }
      if (added > 0) {
        // Persist first; only notify after the write lands.
        ports().writeIds(args.extensionId, next);
        args.notify?.("shelf");
      }
      return { added, total: next.length };
    },
    remove(ids: string[]): { removed: number; total: number } {
      require("library:read");
      const requested = new Set(cleanIds(ids, V2_MAX_SHELF_IDS));
      const current = ports().readIds(args.extensionId);
      const next = current.filter((id) => !requested.has(id));
      if (next.length !== current.length) {
        // Persist first; only notify after the write lands.
        ports().writeIds(args.extensionId, next);
        args.notify?.("shelf");
      }
      return { removed: current.length - next.length, total: next.length };
    },
    clear(): { removed: number } {
      require("library:read");
      const current = ports().readIds(args.extensionId);
      if (current.length > 0) {
        // Persist first; only notify after the write lands.
        ports().writeIds(args.extensionId, []);
        args.notify?.("shelf");
      }
      return { removed: current.length };
    },
  };
}

/** Deny-closed shelf services for hosts without shelf ports. */
export function denyV2ShelfOperations(extensionId: string): V2ShelfOperations {
  const deny = (): never => {
    throw denied("library:read", extensionId);
  };
  return {
    list: () => deny(),
    add: () => deny(),
    remove: () => deny(),
    clear: () => deny(),
  };
}
