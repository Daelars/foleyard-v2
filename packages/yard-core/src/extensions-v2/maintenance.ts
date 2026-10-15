import type { ExtensionV2Permission } from "./definition";
import {
  authorizeV2ReadablePath,
  type V2PathIo,
} from "./filesystem";
import { V2OperationError } from "./operations";
import type { V2SourceGrantStore } from "./source-grants";

/**
 * Folder listing and authorized deletion for v2 handlers (Yard Core
 * context, E1 #176).
 *
 * Folder Janitor v2 scans folders the user picks at runtime and Library
 * Gatherer v2 previews external source folders; both need a bounded
 * directory listing that never walks the whole disk in one call.
 * Empty-folder cleanup (janitor `delete-folders`) goes through the
 * authorized delete here instead of a recursive remove: the folder
 * must still be contained in a Library root and still be empty when it
 * is deleted, and anything else fails with a reason.
 *
 * Permission map (checked first on every call):
 * - `listFolder` → `files:read` plus a readable check: the folder must
 *   sit under a Library root, or under a live readable source grant
 *   issued to the calling extension (missing/expired/foreign grants
 *   deny, exactly like destination grants).
 * - `deleteEmptyFolder` → `files:delete` plus containment rechecked at
 *   delete time against the Library roots. Source-grant roots never
 *   authorize deletion: cleanup stays inside the Library.
 *
 * Bounds: each listing returns at most `V2_FOLDER_LIST_LIMIT` entries.
 * The bound holds before the filesystem work begins: the operation asks
 * its port for one entry past the page it will show (enough to know the
 * folder holds more) and never the whole folder, so an oversized
 * directory is neither materialized nor statted in full. An oversized
 * folder comes back `truncated: true` — a bounded page the caller must
 * narrow — never a silent partial list. Deletion removes one empty
 * directory only — never files, never non-empty folders, never a Library
 * root itself.
 *
 * Validation-to-use limits, stated honestly: containment and
 * emptiness are authorized at check time. Another local process can
 * change the folder between validation and use; the guards do not
 * provide atomic protection against that race.
 *
 * Framework-free: no database handles, no filesystem imports, no v1 imports.
 */

/** Largest directory page one listing call returns. */
export const V2_FOLDER_LIST_LIMIT = 500;

export type V2DirectoryEntryKind = "file" | "directory";

export type V2DirectoryEntry = {
  name: string;
  /** Canonical absolute path of the entry. */
  path: string;
  kind: V2DirectoryEntryKind;
  /** Byte size for files; null for directories and unknown sizes. */
  size: number | null;
};

/** Narrow filesystem surface behind the folder services. */
export type V2FolderScanPorts = {
  /** Configured readable Library roots. */
  libraryRoots(): readonly string[] | Promise<readonly string[]>;
  pathIo(): V2PathIo;
  /**
   * At most `limit` entries of one canonical directory, in directory
   * order. Implementations must stop once `limit` entries are collected —
   * reading no further and statting only what they return — so an
   * oversized folder is never materialized or statted in full. The
   * operation detects an oversized folder by asking for one entry past
   * the page it will show.
   */
  listDirectory(canonicalPath: string, limit: number): Promise<V2DirectoryEntry[]>;
  /** Remove one canonical directory that the caller verified empty. */
  removeEmptyDirectory(canonicalPath: string): Promise<void>;
};

export type V2ListFolderInput = {
  /** Absolute folder path under a Library root. */
  path?: string;
  /** Readable source grant covering a folder outside the Library roots. */
  grantId?: string;
  /** Page size; clamped to [1, `V2_FOLDER_LIST_LIMIT`]. Defaults to the limit. */
  limit?: number;
};

export type V2ListFolderResult = {
  /** Canonical folder that was listed. */
  root: string;
  /** At most the requested limit, sorted by name. */
  entries: V2DirectoryEntry[];
  /**
   * True when the folder held more entries than the limit: `entries` is
   * a bounded page, not the whole folder, so the caller must narrow the
   * folder to list the rest. Never a silent partial list.
   */
  truncated: boolean;
};

export type V2FolderOperations = {
  listFolder(input: V2ListFolderInput): Promise<V2ListFolderResult>;
  deleteEmptyFolder(input: { path: string }): Promise<{ removed: string }>;
};

export type V2FolderFactoryArgs = {
  extensionId: string;
  effectivePermissions: readonly string[];
  folders?: V2FolderScanPorts;
  /** Readable grants for folders outside the Library roots. */
  sources?: V2SourceGrantStore;
  now?: string;
};

/** Clamp a caller-supplied page size to [1, `V2_FOLDER_LIST_LIMIT`]. */
function clampFolderListLimit(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return V2_FOLDER_LIST_LIMIT;
  return Math.max(1, Math.min(V2_FOLDER_LIST_LIMIT, Math.floor(value)));
}

function denied(permission: string, extensionId: string): V2OperationError {
  return new V2OperationError(
    "permission-denied",
    `Extension "${extensionId}" lacks the "${permission}" permission for this operation; grant it to use this command.`,
  );
}

function unsupported(extensionId: string): V2OperationError {
  return new V2OperationError(
    "input-invalid",
    `Folder operations are not supported by this host binding; extension "${extensionId}" cannot reach them here.`,
  );
}

/** Folder services bound to one invocation. See the module docblock for the permission map. */
export function createV2FolderOperations(args: V2FolderFactoryArgs): V2FolderOperations {
  const effective = new Set(args.effectivePermissions);

  const require = (permission: ExtensionV2Permission): void => {
    if (!effective.has(permission)) throw denied(permission, args.extensionId);
  };

  const ports = (): V2FolderScanPorts => {
    if (!args.folders) throw unsupported(args.extensionId);
    return args.folders;
  };

  const readableFolder = async (candidate: string): Promise<string> => {
    const io = ports().pathIo();
    const roots = await ports().libraryRoots();
    const authorized = await authorizeV2ReadablePath(candidate, roots, io);
    if (!authorized.ok) {
      throw new V2OperationError("permission-denied", `Folder is not readable: ${authorized.message}`);
    }
    return authorized.canonicalPath;
  };

  return {
    async listFolder(input: V2ListFolderInput): Promise<V2ListFolderResult> {
      require("files:read");
      let canonical: string;
      if (input.grantId !== undefined) {
        if (!args.sources) throw unsupported(args.extensionId);
        const authorized = args.sources.authorize(input.grantId, args.extensionId, args.now);
        if (!authorized.ok) {
          throw new V2OperationError("permission-denied", authorized.message);
        }
        // The granted root itself is the listing scope: containment
        // runs against the grant root so the grant cannot be widened
        // into a sibling directory.
        const listed = await authorizeV2ReadablePath(
          input.path ?? authorized.grant.rootPath,
          [authorized.grant.rootPath],
          ports().pathIo(),
        );
        if (!listed.ok) {
          throw new V2OperationError("permission-denied", `Folder is not readable: ${listed.message}`);
        }
        canonical = listed.canonicalPath;
      } else if (input.path !== undefined) {
        if (typeof input.path !== "string" || !input.path.trim()) {
          throw new V2OperationError("input-invalid", "Folder path must be a non-empty string.");
        }
        canonical = await readableFolder(input.path);
      } else {
        throw new V2OperationError(
          "input-invalid",
          "List a folder with its path or a readable source grant; neither was provided.",
        );
      }
      const limit = clampFolderListLimit(input.limit);
      let listing: V2DirectoryEntry[];
      try {
        // One entry past the page is enough to know the folder holds
        // more; the port stops at this bound, so the whole folder is
        // never materialized or statted.
        listing = await ports().listDirectory(canonical, limit + 1);
      } catch (error) {
        throw new V2OperationError(
          "input-invalid",
          `Folder ${JSON.stringify(input.path ?? canonical)} cannot be listed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      const truncated = listing.length > limit;
      const entries = [...listing]
        .sort((left, right) =>
          left.name.localeCompare(right.name, undefined, { sensitivity: "base" }),
        )
        .slice(0, limit);
      return { root: canonical, entries, truncated };
    },
    async deleteEmptyFolder(input: { path: string }): Promise<{ removed: string }> {
      require("files:delete");
      if (typeof input.path !== "string" || !input.path.trim()) {
        throw new V2OperationError("input-invalid", "Folder path must be a non-empty string.");
      }
      // Containment recheck at delete time: the canonical folder must
      // sit strictly inside a Library root (never a root itself), and
      // the listing must still be empty when the removal runs.
      const canonical = await readableFolder(input.path);
      const roots = await ports().libraryRoots();
      const io = ports().pathIo();
      let isRoot = false;
      for (const root of roots) {
        try {
          const canonicalRoot = await io.realpath(root);
          if (canonicalRoot === canonical) isRoot = true;
        } catch {
          continue;
        }
      }
      if (isRoot) {
        throw new V2OperationError(
          "input-invalid",
          "A Library root itself is never deleted; remove it from settings instead.",
        );
      }
      let entries: V2DirectoryEntry[];
      try {
        // One entry is enough to tell empty from non-empty; the port
        // stops at the bound rather than listing the whole folder.
        entries = await ports().listDirectory(canonical, 1);
      } catch (error) {
        throw new V2OperationError(
          "input-invalid",
          `Folder ${JSON.stringify(input.path)} cannot be removed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      if (entries.length > 0) {
        throw new V2OperationError(
          "input-invalid",
          `Folder ${JSON.stringify(input.path)} is no longer empty; only empty folders are deleted.`,
        );
      }
      try {
        await ports().removeEmptyDirectory(canonical);
      } catch (error) {
        throw new V2OperationError(
          "handler-failed",
          `Folder ${JSON.stringify(input.path)} could not be removed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      return { removed: canonical };
    },
  };
}

/** Deny-closed folder services for hosts without folder ports. */
export function denyV2FolderOperations(extensionId: string): V2FolderOperations {
  const deny = async (permission: ExtensionV2Permission): Promise<never> => {
    throw denied(permission, extensionId);
  };
  return {
    listFolder: () => deny("files:read"),
    deleteEmptyFolder: () => deny("files:delete"),
  };
}
