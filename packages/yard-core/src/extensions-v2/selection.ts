import type { IndexedAudioFile } from "../domain/audio-file";

import type {
  ExtensionV2Command,
  ExtensionV2CommandScope,
} from "./definition";
import type {
  V2Failure,
  V2SelectionSnapshot,
} from "./invocation";
import { V2_PAYLOAD_LIMITS } from "./invocation";

/**
 * Host-boundary selection handling (Yard Core context, R2).
 *
 * Untrusted selection IDs are validated and scoped here, then resolved
 * through authorized Library operations. A client-supplied file path is
 * never authorization: boundary payloads carrying `paths`/`filePaths` are
 * rejected outright instead of being resolved.
 *
 * Resolvers are registered by reusable input/context contract (scope), not
 * by command name, so adding an extension never adds a host branch.
 */

export type V2SelectionParse =
  | { ok: true; snapshot: V2SelectionSnapshot }
  | { ok: false; failure: V2Failure };

function selectionFailure(message: string): V2SelectionParse {
  return { ok: false, failure: { ok: false, code: "selection-invalid", message } };
}

/**
 * Validate an untrusted boundary payload into a snapshot. Rejects
 * non-string IDs, blank IDs, over-limit ID lists, and any client file
 * path material (`paths`, `filePaths`, `file`).
 */
export function parseV2SelectionSnapshot(raw: unknown): V2SelectionParse {
  if (raw === undefined || raw === null) {
    return { ok: true, snapshot: { fileIds: [] } };
  }
  if (typeof raw !== "object" || Array.isArray(raw)) {
    return selectionFailure("Selection must be an object with file IDs, not a path or list.");
  }
  const record = raw as Record<string, unknown>;
  for (const pathKey of ["paths", "filePaths", "file", "directories"] as const) {
    if (record[pathKey] !== undefined) {
      return selectionFailure(
        `Selection key "${pathKey}" is not accepted; send Library file IDs and the host resolves them. A client file path is never authorization.`,
      );
    }
  }
  const fileIds = record.fileIds ?? [];
  if (!Array.isArray(fileIds)) {
    return selectionFailure("Selection fileIds must be an array of Library file ID strings.");
  }
  if (fileIds.length > V2_PAYLOAD_LIMITS.maxFileIds) {
    return {
      ok: false,
      failure: {
        ok: false,
        code: "payload-too-large",
        message: `Selection holds ${fileIds.length} file ID(s); the limit is ${V2_PAYLOAD_LIMITS.maxFileIds}. Narrow the selection and retry.`,
      },
    };
  }
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const candidate of fileIds) {
    if (typeof candidate !== "string" || !candidate.trim()) {
      return selectionFailure("Every selection file ID must be a non-empty string.");
    }
    if (!seen.has(candidate)) {
      seen.add(candidate);
      ids.push(candidate);
    }
  }
  const snapshot: V2SelectionSnapshot = { fileIds: ids };
  if (record.folderPath !== undefined) {
    if (typeof record.folderPath !== "string" || !record.folderPath.trim()) {
      return selectionFailure("Selection folderPath must be a non-empty string when provided.");
    }
    snapshot.folderPath = record.folderPath;
  }
  if (record.collectionId !== undefined) {
    if (typeof record.collectionId !== "string" || !record.collectionId.trim()) {
      return selectionFailure("Selection collectionId must be a non-empty string when provided.");
    }
    snapshot.collectionId = record.collectionId;
  }
  if (record.dropFileCount !== undefined) {
    if (
      typeof record.dropFileCount !== "number" ||
      !Number.isInteger(record.dropFileCount) ||
      record.dropFileCount < 0
    ) {
      return selectionFailure("Selection dropFileCount must be a non-negative integer when provided.");
    }
    snapshot.dropFileCount = record.dropFileCount;
  }
  return { ok: true, snapshot };
}

/**
 * Narrow Library port the v2 selection layer may use. Structural subset of
 * the Yard Core repository contracts: only indexed-record reads, no raw
 * paths, no writes. The application implements this over its repositories.
 */
export type V2LibraryPorts = {
  getFileById(id: string): IndexedAudioFile | null;
  getFilesByIds(ids: string[]): IndexedAudioFile[];
  collectionExists?(id: string): boolean;
};

export type V2ResolvedSelection = {
  files: IndexedAudioFile[];
  folderPath?: string;
  collectionId?: string;
};

export type V2SelectionResolution =
  | { ok: true; selection: V2ResolvedSelection }
  | { ok: false; failure: V2Failure };

export type V2SelectionResolver = (
  snapshot: V2SelectionSnapshot,
  ports: V2LibraryPorts,
) => V2SelectionResolution | Promise<V2SelectionResolution>;

function resolveByIds(
  snapshot: V2SelectionSnapshot,
  ports: V2LibraryPorts,
  opts: { allowEmpty: boolean; commandId: string; extensionId: string },
): V2SelectionResolution {
  const found = ports.getFilesByIds(snapshot.fileIds);
  const byId = new Map(found.map((file) => [file.id, file]));
  const missing = snapshot.fileIds.filter((id) => {
    const file = byId.get(id);
    return !file || file.removedAt !== null;
  });
  if (missing.length > 0) {
    return {
      ok: false,
      failure: {
        ok: false,
        code: "selection-unresolvable",
        message: `Selection references ${missing.length} sound(s) outside the Library index (${missing
          .slice(0, 5)
          .map((id) => JSON.stringify(id))
          .join(", ")}${missing.length > 5 ? ", …" : ""}); refresh the selection and retry.`,
        extensionId: opts.extensionId,
        commandId: opts.commandId,
      },
    };
  }
  const files = snapshot.fileIds
    .map((id) => byId.get(id)!)
    .filter((file) => file.removedAt === null);
  if (!opts.allowEmpty && files.length === 0) {
    return {
      ok: false,
      failure: {
        ok: false,
        code: "selection-empty",
        message: "This command needs at least one selected sound; select Library items and retry.",
        extensionId: opts.extensionId,
        commandId: opts.commandId,
      },
    };
  }
  return { ok: true, selection: { files } };
}

/**
 * Scope-keyed resolvers: one reusable contract per context kind. The table
 * is keyed by scope (`selection`, `file`, `folder`, `collection`,
 * `global`, `drop`), never by command name.
 */
export function defaultV2SelectionResolvers(
  command: ExtensionV2Command,
  extensionId: string,
): Record<ExtensionV2CommandScope, V2SelectionResolver> {
  const byIds = (
    snapshot: V2SelectionSnapshot,
    ports: V2LibraryPorts,
  ): V2SelectionResolution =>
    resolveByIds(snapshot, ports, {
      allowEmpty: command.requiresSelection !== true,
      commandId: command.id,
      extensionId,
    });
  const scoped =
    (kind: "folder" | "collection" | "drop" | "global") =>
    (
      snapshot: V2SelectionSnapshot,
      ports: V2LibraryPorts,
    ): V2SelectionResolution => {
      if (kind === "folder") {
        if (!snapshot.folderPath) {
          return {
            ok: false,
            failure: {
              ok: false,
              code: "selection-invalid",
              message: "This command needs a folder context; open it from a folder and retry.",
              extensionId,
              commandId: command.id,
            },
          };
        }
        return { ok: true, selection: { files: [], folderPath: snapshot.folderPath } };
      }
      if (kind === "collection") {
        if (!snapshot.collectionId) {
          return {
            ok: false,
            failure: {
              ok: false,
              code: "selection-invalid",
              message: "This command needs a Collection context; open it from a Collection and retry.",
              extensionId,
              commandId: command.id,
            },
          };
        }
        if (ports.collectionExists && !ports.collectionExists(snapshot.collectionId)) {
          return {
            ok: false,
            failure: {
              ok: false,
              code: "selection-unresolvable",
              message: `Collection ${JSON.stringify(snapshot.collectionId)} is not in the Library; refresh and retry.`,
              extensionId,
              commandId: command.id,
            },
          };
        }
        return { ok: true, selection: { files: [], collectionId: snapshot.collectionId } };
      }
      if (kind === "drop") {
        if (!snapshot.dropFileCount || snapshot.dropFileCount < 1) {
          return {
            ok: false,
            failure: {
              ok: false,
              code: "selection-empty",
              message: "This command needs at least one dropped file; drop sounds onto the target and retry.",
              extensionId,
              commandId: command.id,
            },
          };
        }
        return { ok: true, selection: { files: [] } };
      }
      return { ok: true, selection: { files: [] } };
    };
  return {
    selection: byIds,
    file: byIds,
    folder: scoped("folder"),
    collection: scoped("collection"),
    global: scoped("global"),
    drop: scoped("drop"),
  };
}

/** Resolve a validated snapshot through the scope contract for `command`. */
export async function resolveV2Selection(
  snapshot: V2SelectionSnapshot,
  command: ExtensionV2Command,
  extensionId: string,
  ports: V2LibraryPorts,
  overrides?: Partial<Record<ExtensionV2CommandScope, V2SelectionResolver>>,
): Promise<V2SelectionResolution> {
  const table = defaultV2SelectionResolvers(command, extensionId);
  const resolver = overrides?.[command.scope] ?? table[command.scope];
  return resolver(snapshot, ports);
}
