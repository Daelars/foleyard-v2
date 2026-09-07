import type { ScanFileRecord } from "../services/library/scan-types";

import type { ExtensionV2Permission } from "./definition";
import { screenV2CandidatePath } from "./filesystem";
import { V2OperationError } from "./operations";

/**
 * Library index mutations for v2 handlers (Yard Core context, E1 #176).
 *
 * Library reads stay in `operations.ts` behind `library:read`. The two
 * mutations here sit behind `library:write`:
 * - `markRemoved` resolves index IDs to paths and flags them removed
 *   (Folder Janitor v2 `remove-files`, Drop Rules v2 follow-ups).
 * - `insertGathered` inserts gathered records for files copied from
 *   external source folders (Library Gatherer v2 `gather`).
 *
 * Both methods check the invocation's effective permissions first; an
 * unauthorized handler that omits its own check still cannot mutate.
 * Unknown IDs never fail a batch: they report in `unknownIds` so the
 * handler can surface them honestly. Inserted paths pass the same
 * lexical traversal screen as every other v2 path, and each call is
 * bounded so one run cannot flood the index.
 *
 * The host supplies repository-backed ports; this module holds the
 * policy. Framework-free: no database handles, no v1 imports.
 */

export const V2_LIBRARY_MUTATION_LIMIT = 500;

/** Narrow repository surface behind the mutation services. */
export type V2LibraryMutationPorts = {
  markRemovedByPaths(paths: string[], removedAt: string, now: string): void;
  insertRecords(records: ScanFileRecord[], now: string): void;
};

export type V2MarkRemovedResult = {
  marked: string[];
  unknownIds: string[];
};

export type V2InsertGatheredResult = {
  inserted: number;
};

export type V2LibraryMutationOperations = {
  markRemoved(ids: string[]): V2MarkRemovedResult;
  insertGathered(records: ScanFileRecord[]): V2InsertGatheredResult;
};

export type V2LibraryMutationFactoryArgs = {
  extensionId: string;
  effectivePermissions: readonly string[];
  mutations?: V2LibraryMutationPorts;
  /** Reads the index to resolve IDs to paths. */
  resolveByIds(ids: string[]): Array<{ id: string; path: string }>;
  /** Called after the mutation persists, never before. */
  notify?: (scope: "library") => void;
  now?: string | (() => string);
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
    `Library mutations are not supported by this host binding; extension "${extensionId}" cannot change the Library index here.`,
  );
}

function checkId(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new V2OperationError("input-invalid", `${label} must be a non-empty string.`);
  }
  return value;
}

function checkRecord(record: unknown, index: number): ScanFileRecord {
  const candidate = record as Partial<ScanFileRecord> | null;
  if (typeof candidate !== "object" || candidate === null) {
    throw new V2OperationError("input-invalid", `Gathered record ${index} must be an object.`);
  }
  const path = typeof candidate.path === "string" ? candidate.path : "";
  const filename = typeof candidate.filename === "string" ? candidate.filename : "";
  if (!path.trim()) {
    throw new V2OperationError("input-invalid", `Gathered record ${index} needs a non-empty path.`);
  }
  if (!filename.trim()) {
    throw new V2OperationError("input-invalid", `Gathered record ${index} needs a non-empty filename.`);
  }
  const screened = screenV2CandidatePath(path);
  if (screened) {
    throw new V2OperationError("input-invalid", `Gathered record ${index} has a rejected path: ${screened.message}`);
  }
  if (typeof candidate.mtimeMs !== "number" || !Number.isFinite(candidate.mtimeMs)) {
    throw new V2OperationError("input-invalid", `Gathered record ${index} needs a finite mtimeMs.`);
  }
  if (typeof candidate.lastScannedAt !== "string" || !candidate.lastScannedAt.trim()) {
    throw new V2OperationError("input-invalid", `Gathered record ${index} needs a lastScannedAt timestamp.`);
  }
  return {
    path,
    filename,
    libraryRoot: candidate.libraryRoot ?? null,
    directory: candidate.directory ?? null,
    format: candidate.format ?? null,
    codec: candidate.codec ?? null,
    duration: candidate.duration ?? null,
    sampleRate: candidate.sampleRate ?? null,
    bitDepth: candidate.bitDepth ?? null,
    channels: candidate.channels ?? null,
    fileSize: candidate.fileSize ?? null,
    mtimeMs: candidate.mtimeMs,
    removedAt: candidate.removedAt ?? null,
    lastScannedAt: candidate.lastScannedAt,
  };
}

/** Library index mutations bound to one invocation. See the module docblock for the permission map. */
export function createV2LibraryMutationOperations(
  args: V2LibraryMutationFactoryArgs,
): V2LibraryMutationOperations {
  const effective = new Set(args.effectivePermissions);
  const nowOption = args.now;
  const clock = typeof nowOption === "function" ? nowOption : () => nowOption ?? new Date().toISOString();

  const require = (permission: ExtensionV2Permission): void => {
    if (!effective.has(permission)) throw denied(permission, args.extensionId);
  };

  const ports = (): V2LibraryMutationPorts => {
    if (!args.mutations) throw unsupported(args.extensionId);
    return args.mutations;
  };

  return {
    markRemoved(ids: string[]): V2MarkRemovedResult {
      require("library:write");
      const seen = new Set<string>();
      const ordered: string[] = [];
      for (const id of ids) {
        const clean = checkId(id, "Sound ID");
        if (!seen.has(clean)) {
          seen.add(clean);
          ordered.push(clean);
        }
      }
      if (ordered.length > V2_LIBRARY_MUTATION_LIMIT) {
        throw new V2OperationError(
          "input-invalid",
          `This removal holds ${ordered.length} sounds; the per-call limit is ${V2_LIBRARY_MUTATION_LIMIT}. Narrow the selection and retry.`,
        );
      }
      const resolved = new Map(args.resolveByIds(ordered).map((entry) => [entry.id, entry.path]));
      const paths = ordered.flatMap((id) => (resolved.get(id) ? [resolved.get(id)!] : []));
      const unknownIds = ordered.filter((id) => !resolved.has(id));
      const at = clock();
      if (paths.length > 0) {
        // Persist first; only notify after the write lands.
        ports().markRemovedByPaths(paths, at, at);
      }
      args.notify?.("library");
      return { marked: ordered.filter((id) => resolved.has(id)), unknownIds };
    },
    insertGathered(records: ScanFileRecord[]): V2InsertGatheredResult {
      require("library:write");
      if (!Array.isArray(records) || records.length === 0) {
        throw new V2OperationError("input-invalid", "Gathered records must be a non-empty array.");
      }
      if (records.length > V2_LIBRARY_MUTATION_LIMIT) {
        throw new V2OperationError(
          "input-invalid",
          `This gather holds ${records.length} records; the per-call limit is ${V2_LIBRARY_MUTATION_LIMIT}. Gather in smaller batches.`,
        );
      }
      const checked = records.map((record, index) => checkRecord(record, index));
      // Persist first; only notify after the write lands.
      ports().insertRecords(checked, clock());
      args.notify?.("library");
      return { inserted: checked.length };
    },
  };
}

/** Deny-closed mutations for hosts without mutation ports. */
export function denyV2LibraryMutationOperations(extensionId: string): V2LibraryMutationOperations {
  const deny = (): never => {
    throw denied("library:write", extensionId);
  };
  return {
    markRemoved: () => deny(),
    insertGathered: () => deny(),
  };
}
