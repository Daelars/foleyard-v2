import type { IndexedAudioFile } from "../domain/audio-file";

import type { ExtensionV2Permission, ExtensionV2Setting } from "./definition";
import { validateV2SettingValue } from "./definition";
import type { V2PlanManager, V2PlanPrepareSpec } from "./plans";
import {
  authorizeV2ReadablePath,
  authorizeV2WritablePath,
  type V2PathIo,
} from "./filesystem";
import type { V2GrantStore } from "./grants";
import { isV2OutputConflict, type V2FileVersion } from "./output-ownership";
import type { V2SourceGrantStore } from "./source-grants";
import type { V2FailureCode } from "./invocation";

/**
 * Narrow semantic operation services for v2 handlers (Yard Core context, R3).
 *
 * Handlers never touch repositories, the database, or the filesystem
 * directly. They receive exactly this surface, bound to one invocation:
 * every method first checks the invocation's effective permissions
 * (deny-by-default; an unauthorized handler that omits its own check
 * still cannot read or write), then authorizes the actual operation,
 * including derived output and temporary paths.
 *
 * Explicit permission map (never inferred from method names):
 * - library.getFile / library.listPage → `library:read`
 * - selection.resolveSource → the source's declared requiredPermission
 * - files.readFile → `files:read` plus a readable-root check on the record path
 * - files.copyToOutput → `files:copy` plus readable source and grant-root destination
 * - files.createOutputText → `files:write` plus grant-root destination
 * - archive.createZip → `files:read` (sources) and `files:write` (destination)
 * - settings.get → `settings:read`; settings.set/reset → `settings:write`
 *   (when the host supplies declarations, IDs and values are validated
 *   against the extension definition; corrupt persisted rows read as the
 *   declared default)
 * - state.* → extension-namespaced by construction; only the owning
 *   extension's keys are reachable, so no cross-extension access is possible
 * - jobs.* → the current invocation's reporter only
 * - plans.prepare → the invocation's own extension/command binding; a
 *   handler cannot prepare plans for another extension (R5)
 *
 * Deliberately absent: repository proxies, raw database handles, raw
 * path resolvers, and unrestricted filesystem APIs. Library roots
 * (readable) and destination grants (writable) stay distinct. Grant
 * tokens never appear here; only grant IDs are handled.
 *
 * Output creation and cleanup are scoped to job-owned resources: every
 * created entry is created exclusively (a pre-existing file is never
 * truncated, and two concurrent jobs can never both claim one
 * destination) and tracked with the version identity the port captured
 * at creation. `workspace.dispose` removes a tracked path only while it
 * still holds that version, so a replacement at a previously owned path
 * is never deleted (see `output-ownership.ts`).
 */

export class V2OperationError extends Error {
  constructor(
    readonly failureCode: V2FailureCode,
    message: string,
  ) {
    super(message);
    this.name = "V2OperationError";
  }
}

function denied(permission: string, extensionId: string): V2OperationError {
  return new V2OperationError(
    "permission-denied",
    `Extension "${extensionId}" lacks the "${permission}" permission for this operation; grant it to use this command.`,
  );
}

/**
 * Readable-root surface shared by every guarded file-content read: the
 * base `files.readFile`/`copyToOutput`/`createZip` operations and the
 * analysis inference read. A host that supplies analysis supplies this
 * too, so analysis resolves paths through exactly the same
 * authorization as any other file-content read.
 */
export type V2ReadableRootsPorts = {
  /** Configured readable Library roots. */
  libraryRoots(): readonly string[] | Promise<readonly string[]>;
  pathIo(): V2PathIo;
};

/**
 * Resolve one live Library record by ID. A removed sound is not in the
 * index as far as callers are concerned: it fails with `input-invalid`
 * rather than being read or decoded.
 */
export function liveV2Record(library: V2LibraryReadPorts, fileId: string): IndexedAudioFile {
  const record = library.getFileById(fileId);
  if (!record || record.removedAt !== null) {
    throw new V2OperationError(
      "input-invalid",
      `Sound ${JSON.stringify(fileId)} is not in the Library index; refresh the selection and retry.`,
    );
  }
  return record;
}

/**
 * Authorize reading one live record's path against the current Library
 * roots and return the canonical path. The same containment screen
 * (`authorizeV2ReadablePath`) guards every file-content read, so a path
 * that escaped a root — or a link that resolves outside one — is
 * rejected before any bytes are read.
 */
export async function authorizeV2ReadableRecord(
  record: IndexedAudioFile,
  reads: V2ReadableRootsPorts,
): Promise<string> {
  const roots = await reads.libraryRoots();
  const authorized = await authorizeV2ReadablePath(record.path, roots, reads.pathIo());
  if (!authorized.ok) {
    throw new V2OperationError(
      "permission-denied",
      `Sound ${JSON.stringify(record.id)} is not readable: ${authorized.message}`,
    );
  }
  return authorized.canonicalPath;
}

export const V2_OPERATIONS_PAGE_LIMIT = 500;
export const V2_OPERATIONS_MAX_ARCHIVE_ENTRIES = 500;
export const V2_OPERATIONS_MAX_OUTPUT_TEXT_BYTES = 1_048_576;

export type V2LibraryReadPorts = {
  getFileById(id: string): IndexedAudioFile | null;
  getFilesByIds(ids: string[]): IndexedAudioFile[];
  listPage(
    cursor: string | null,
    limit: number,
  ): { files: IndexedAudioFile[]; nextCursor: string | null };
  collectionExists?(id: string): boolean;
};

export type V2FileContentPorts = {
  readFileBytes(canonicalPath: string): Promise<Uint8Array>;
  /**
   * Exclusively create `destCanonical` by copying `sourceCanonical`.
   * Rejects with `V2OutputConflictError` when the destination already
   * exists: the create is the claim, so concurrent jobs can never both
   * own one destination and an existing file is never truncated.
   * Returns the created entry's version for later version-checked
   * cleanup.
   */
  copyFile(sourceCanonical: string, destCanonical: string): Promise<V2FileVersion>;
  /** Exclusively create `destCanonical` from bytes. Same contract as `copyFile`. */
  writeFileBytes(destCanonical: string, bytes: Uint8Array): Promise<V2FileVersion>;
  /**
   * Remove `canonicalPath` only while it still holds `version` (the
   * identity captured when this job created it). A replacement at the
   * same path reports `{ removed: false }` and survives.
   */
  deleteFileIfVersion(
    canonicalPath: string,
    version: V2FileVersion,
  ): Promise<{ removed: boolean }>;
  /** Configured readable Library roots. */
  libraryRoots(): readonly string[] | Promise<readonly string[]>;
  pathIo(): V2PathIo;
};

export type V2ArchiveEntry =
  | { name: string; sourcePath: string }
  | { name: string; text: string };

export type V2ArchivePorts = {
  /**
   * Exclusively create the archive at `destPath`; rejects with
   * `V2OutputConflictError` when the destination already exists (never
   * truncating an existing file) and returns the created entry's
   * version for later version-checked cleanup.
   */
  createZipArchive(
    entries: readonly V2ArchiveEntry[],
    destPath: string,
  ): Promise<{ bytesWritten: number; version: V2FileVersion }>;
};

export type V2SettingsPorts = {
  readRaw(key: string): unknown;
  writeRaw(key: string, value: unknown): void;
};

export type V2ExtensionStatePorts = {
  readAll(extensionId: string): Record<string, unknown>;
  writeAll(extensionId: string, state: Record<string, unknown>): void;
};

export type V2JobReporter = {
  reportProgress(completed: number, total: number): void;
  throwIfCancelled(): void;
};

export type V2NamedSelectionSource = {
  /** Stable source name handlers request, e.g. `shelf` or `recent`. */
  name: string;
  requiredPermission: ExtensionV2Permission;
  listIds(): string[] | Promise<string[]>;
};

export type V2OperationFactoryArgs = {
  extensionId: string;
  invocationId: string;
  effectivePermissions: readonly string[];
  grants: V2GrantStore;
  /** Readable source grants for copying files from external folders (Library Gatherer v2). */
  sources?: V2SourceGrantStore;
  library: V2LibraryReadPorts;
  files: V2FileContentPorts;
  archive: V2ArchivePorts;
  settings: V2SettingsPorts;
  extensionState: V2ExtensionStatePorts;
  jobs?: V2JobReporter;
  selectionSources?: readonly V2NamedSelectionSource[];
  now?: string;
  /**
   * Author-declared settings for the extension. When present, settings
   * reads/writes validate against these declarations (unknown IDs and
   * mistyped values reject; corrupt rows read as defaults). Absent, the
   * legacy namespace-only behavior applies.
   */
  settingsDeclarations?: readonly ExtensionV2Setting[];
  /**
   * Plan preparation binding (R5). The manager validates options against
   * the command schema and binds the plan to this invocation; the
   * service never accepts another extension's ownership.
   */
  plans?: {
    manager: V2PlanManager;
    commandId: string;
    capabilities: readonly string[];
  };
};

export type V2LibraryOperations = {
  getFile(id: string): IndexedAudioFile | null;
  listPage(
    cursor?: string | null,
    limit?: number,
  ): { files: IndexedAudioFile[]; nextCursor: string | null };
};

export type V2SelectionOperations = {
  sourceNames(): string[];
  resolveSource(name: string): Promise<IndexedAudioFile[]>;
};

export type V2FileOperations = {
  readFile(fileId: string): Promise<Uint8Array>;
  copyToOutput(fileId: string, outputName: string, grantId: string): Promise<{ path: string }>;
  createOutputText(grantId: string, name: string, text: string): Promise<{ path: string }>;
  /**
   * Copy a file from a readable source grant into a writable destination
   * grant (Library Gatherer v2). The source path must sit under the
   * source grant's root; the destination must sit under the destination
   * grant's root and is created exclusively — an existing entry is never
   * overwritten. The created entry is tracked by version for job-owned
   * cleanup.
   */
  copyFromSource(
    sourceGrantId: string,
    sourcePath: string,
    outputName: string,
    destGrantId: string,
  ): Promise<{ path: string }>;
};

export type V2ArchiveOperations = {
  createZip(
    grantId: string,
    name: string,
    fileIds: string[],
    options?: { manifestText?: string },
  ): Promise<{ path: string; entries: number }>;
};

export type V2SettingsOperations = {
  get(settingId: string, fallback?: unknown): unknown;
  set(settingId: string, value: unknown): void;
  /** Restore declared defaults (one setting, or all when omitted). */
  reset(settingId?: string): void;
};

export type V2ExtensionStateOperations = {
  read(key: string): unknown;
  write(key: string, value: unknown): void;
  remove(key: string): void;
};

export type V2JobOperations = {
  reportProgress(completed: number, total: number): void;
  throwIfCancelled(): void;
};

export type V2PlanOperations = {
  /**
   * Bind a review plan to this invocation's extension/command. Options
   * are validated against the command input schema now and revalidated
   * (with targets and grants) at apply; returns the plan ID the handler
   * passes to `reviewV2Result`.
   */
  prepare(spec: V2PlanPrepareSpec): { planId: string; expiresAt: string };
};

export type V2WorkspaceOperations = {
  ownedPaths(): string[];
  dispose(): Promise<{ removed: string[] }>;
};

export type V2OperationServices = {
  library: V2LibraryOperations;
  selection: V2SelectionOperations;
  files: V2FileOperations;
  archive: V2ArchiveOperations;
  settings: V2SettingsOperations;
  state: V2ExtensionStateOperations;
  jobs: V2JobOperations;
  plans: V2PlanOperations;
  workspace: V2WorkspaceOperations;
};

function checkKey(value: string, label: string): void {
  if (!value.trim()) throw new V2OperationError("input-invalid", `${label} must be a non-empty string.`);
}

function checkOutputName(name: string): void {
  checkKey(name, "Output name");
  if (name.includes("/") || name.includes("\\") || name === ".." || name.includes("..")) {
    throw new V2OperationError(
      "input-invalid",
      `Output name ${JSON.stringify(name)} must be a single file name without path separators or "..".`,
    );
  }
}

function assertSerializable(value: unknown, label: string): void {
  try {
    const text = JSON.stringify(value);
    if (text === undefined) {
      throw new Error("unserializable");
    }
  } catch {
    throw new V2OperationError(
      "input-invalid",
      `${label} must be JSON-serializable; functions and symbols are rejected.`,
    );
  }
}

/** Narrow semantic services bound to one invocation. See the module docblock for the permission map. */
export function createV2OperationServices(args: V2OperationFactoryArgs): V2OperationServices {
  const {
    extensionId,
    grants,
    library,
    files,
    archive,
    settings,
    extensionState,
    selectionSources = [],
  } = args;
  const effective = new Set(args.effectivePermissions);
  /** Created entries by canonical path, with the version identity captured at creation. */
  const owned = new Map<string, V2FileVersion>();
  const jobs: V2JobReporter = args.jobs ?? {
    reportProgress: () => {},
    throwIfCancelled: () => {},
  };

  const require = (permission: ExtensionV2Permission): void => {
    if (!effective.has(permission)) throw denied(permission, extensionId);
  };

  const settingKey = (settingId: string): string => {
    checkKey(settingId, "Setting ID");
    if (!settingId.startsWith(`${extensionId}.`)) {
      throw new V2OperationError(
        "permission-denied",
        `Setting ${JSON.stringify(settingId)} is outside extension "${extensionId}"; extensions reach only their own namespace.`,
      );
    }
    return `extension:${extensionId}:setting:${settingId}`;
  };

  const declaredSetting = (settingId: string) => {
    const declarations = args.settingsDeclarations;
    if (!declarations) return null;
    const shortId = settingId.startsWith(`${extensionId}.`)
      ? settingId.slice(extensionId.length + 1)
      : settingId;
    const found = declarations.find((entry) => entry.id === shortId || entry.id === settingId);
    if (!found) {
      throw new V2OperationError(
        "input-invalid",
        `Setting ${JSON.stringify(settingId)} is not declared by extension "${extensionId}"; declared settings: ${declarations.map((entry) => `"${entry.id}"`).join(", ") || "none"}.`,
      );
    }
    return found;
  };

  // Liveness and Library-root containment come from the shared read
  // guard (#268), so analysis inference authorizes paths through exactly
  // the same code as files.readFile/copyToOutput/createZip.
  const liveRecord = (fileId: string): IndexedAudioFile => liveV2Record(library, fileId);
  const readableSource = (record: IndexedAudioFile): Promise<string> =>
    authorizeV2ReadableRecord(record, files);

  /**
   * Authorize an output name under the destination grant and return the
   * canonical path to create. Existence is not probed here: creation
   * itself is exclusive, so the check cannot be lost to a concurrent
   * writer between probing and writing.
   */
  const authorizedOutput = async (grantId: string, name: string): Promise<string> => {
    const authorized = grants.authorize(grantId, extensionId, args.now);
    if (!authorized.ok) {
      throw new V2OperationError("permission-denied", authorized.message);
    }
    const candidate = `${authorized.grant.rootPath.replace(/[\\/]+$/, "")}/${name}`;
    const resolved = await authorizeV2WritablePath(candidate, authorized.grant.rootPath, files.pathIo());
    if (!resolved.ok) {
      throw new V2OperationError("permission-denied", `Output ${JSON.stringify(name)} is not writable: ${resolved.message}`);
    }
    return resolved.canonicalPath;
  };

  /**
   * Create one output exclusively and record its version. A lost race or
   * a pre-existing file is the documented conflict outcome; the entry is
   * never truncated and never tracked, so nothing is cleaned up that this
   * job did not create.
   */
  const createOwned = async (
    name: string,
    dest: string,
    create: () => Promise<V2FileVersion>,
  ): Promise<string> => {
    let version: V2FileVersion;
    try {
      version = await create();
    } catch (error) {
      if (isV2OutputConflict(error)) {
        throw new V2OperationError(
          "input-invalid",
          `Output ${JSON.stringify(name)} already exists in the destination; choose another name. Existing files are never overwritten.`,
        );
      }
      throw error;
    }
    owned.set(dest, version);
    return dest;
  };

  return {
    library: {
      getFile(id: string): IndexedAudioFile | null {
        require("library:read");
        const record = library.getFileById(id);
        return record && record.removedAt === null ? record : null;
      },
      listPage(cursor: string | null = null, limit = 100) {
        require("library:read");
        const bounded = Math.max(1, Math.min(V2_OPERATIONS_PAGE_LIMIT, Math.floor(limit)));
        return library.listPage(cursor, bounded);
      },
    },
    selection: {
      sourceNames(): string[] {
        return selectionSources.map((source) => source.name);
      },
      async resolveSource(name: string): Promise<IndexedAudioFile[]> {
        const source = selectionSources.find((entry) => entry.name === name);
        if (!source) {
          throw new V2OperationError(
            "input-invalid",
            `Selection source ${JSON.stringify(name)} is unknown; available sources: ${selectionSources.map((entry) => JSON.stringify(entry.name)).join(", ") || "none"}.`,
          );
        }
        require(source.requiredPermission);
        const ids = await source.listIds();
        const found = library.getFilesByIds(ids);
        const byId = new Map(found.map((file) => [file.id, file]));
        const missing = ids.filter((id) => {
          const file = byId.get(id);
          return !file || file.removedAt !== null;
        });
        if (missing.length > 0) {
          throw new V2OperationError(
            "input-invalid",
            `Selection source ${JSON.stringify(name)} references ${missing.length} sound(s) outside the Library index; refresh and retry.`,
          );
        }
        return ids.map((id) => byId.get(id)!);
      },
    },
    files: {
      async readFile(fileId: string): Promise<Uint8Array> {
        require("files:read");
        jobs.throwIfCancelled();
        const canonical = await readableSource(liveRecord(fileId));
        return files.readFileBytes(canonical);
      },
      async copyToOutput(fileId: string, outputName: string, grantId: string): Promise<{ path: string }> {
        require("files:copy");
        jobs.throwIfCancelled();
        checkOutputName(outputName);
        const canonical = await readableSource(liveRecord(fileId));
        const dest = await authorizedOutput(grantId, outputName);
        return { path: await createOwned(outputName, dest, () => files.copyFile(canonical, dest)) };
      },
      async createOutputText(grantId: string, name: string, text: string): Promise<{ path: string }> {
        require("files:write");
        jobs.throwIfCancelled();
        checkOutputName(name);
        const bytes = new TextEncoder().encode(text);
        if (bytes.length > V2_OPERATIONS_MAX_OUTPUT_TEXT_BYTES) {
          throw new V2OperationError(
            "input-invalid",
            `Output ${JSON.stringify(name)} is ${bytes.length} bytes; the text-output limit is ${V2_OPERATIONS_MAX_OUTPUT_TEXT_BYTES}.`,
          );
        }
        const dest = await authorizedOutput(grantId, name);
        return { path: await createOwned(name, dest, () => files.writeFileBytes(dest, bytes)) };
      },
      async copyFromSource(
        sourceGrantId: string,
        sourcePath: string,
        outputName: string,
        destGrantId: string,
      ): Promise<{ path: string }> {
        require("files:copy");
        jobs.throwIfCancelled();
        checkOutputName(outputName);
        if (!args.sources) {
          throw new V2OperationError(
            "input-invalid",
            `Source grants are not supported by this host binding; extension "${extensionId}" cannot copy from external folders here.`,
          );
        }
        if (typeof sourcePath !== "string" || !sourcePath.trim()) {
          throw new V2OperationError("input-invalid", "Source path must be a non-empty string.");
        }
        const authorized = args.sources.authorize(sourceGrantId, extensionId, args.now);
        if (!authorized.ok) {
          throw new V2OperationError("permission-denied", authorized.message);
        }
        // Containment against the source grant root: the grant cannot be
        // widened into a sibling directory.
        const source = await authorizeV2ReadablePath(
          sourcePath,
          [authorized.grant.rootPath],
          files.pathIo(),
        );
        if (!source.ok) {
          throw new V2OperationError(
            "permission-denied",
            `Source ${JSON.stringify(sourcePath)} is not readable: ${source.message}`,
          );
        }
        const dest = await authorizedOutput(destGrantId, outputName);
        return { path: await createOwned(outputName, dest, () => files.copyFile(source.canonicalPath, dest)) };
      },
    },
    archive: {
      async createZip(
        grantId: string,
        name: string,
        fileIds: string[],
        options?: { manifestText?: string },
      ): Promise<{ path: string; entries: number }> {
        require("files:read");
        require("files:write");
        jobs.throwIfCancelled();
        checkOutputName(name);
        if (!name.toLowerCase().endsWith(".zip")) {
          throw new V2OperationError("input-invalid", `Archive name ${JSON.stringify(name)} must end in ".zip".`);
        }
        if (fileIds.length > V2_OPERATIONS_MAX_ARCHIVE_ENTRIES) {
          throw new V2OperationError(
            "input-invalid",
            `Archive holds ${fileIds.length} entr(ies); the limit is ${V2_OPERATIONS_MAX_ARCHIVE_ENTRIES}. Narrow the selection and retry.`,
          );
        }
        const entries: V2ArchiveEntry[] = [];
        const seenNames = new Set<string>();
        for (const fileId of fileIds) {
          const record = liveRecord(fileId);
          const entryName = record.filename || `${record.id}.bin`;
          if (seenNames.has(entryName.toLowerCase())) {
            throw new V2OperationError(
              "input-invalid",
              `Archive entry ${JSON.stringify(entryName)} collides with another entry (case-insensitive); rename before archiving.`,
            );
          }
          seenNames.add(entryName.toLowerCase());
          entries.push({ name: entryName, sourcePath: await readableSource(record) });
        }
        if (options?.manifestText !== undefined) {
          if (seenNames.has("manifest.json")) {
            throw new V2OperationError(
              "input-invalid",
              `Archive already contains "manifest.json"; the manifest entry is reserved and never overwritten.`,
            );
          }
          const manifestBytes = new TextEncoder().encode(options.manifestText);
          if (manifestBytes.length > V2_OPERATIONS_MAX_OUTPUT_TEXT_BYTES) {
            throw new V2OperationError(
              "input-invalid",
              `Archive manifest is ${manifestBytes.length} bytes; the limit is ${V2_OPERATIONS_MAX_OUTPUT_TEXT_BYTES}.`,
            );
          }
          // In-memory text entry: the manifest never touches a guessed
          // temporary filename (the v1 B12 data-loss class), and the
          // application codec streams it like any other entry.
          entries.push({ name: "manifest.json", text: options.manifestText });
        }
        const dest = await authorizedOutput(grantId, name);
        const created = await createOwned(name, dest, async () => {
          const result = await archive.createZipArchive(entries, dest);
          return result.version;
        });
        return { path: created, entries: entries.length };
      },
    },
    settings: {
      get(settingId: string, fallback: unknown = null): unknown {
        require("settings:read");
        const stored = settings.readRaw(settingKey(settingId));
        if (stored === undefined) {
          const declared = args.settingsDeclarations ? declaredSetting(settingId) : null;
          return declared ? declared.defaultValue : fallback;
        }
        if (args.settingsDeclarations) {
          // Corrupt persisted rows read as the declared default (R7 safe
          // failure); see V2AuthoredSettingsStore.diagnose for reporting.
          const declared = declaredSetting(settingId);
          if (declared && validateV2SettingValue(declared, stored)) return declared.defaultValue;
        }
        return stored;
      },
      set(settingId: string, value: unknown): void {
        require("settings:write");
        assertSerializable(value, `Setting ${JSON.stringify(settingId)}`);
        if (args.settingsDeclarations) {
          const declared = declaredSetting(settingId);
          const invalid = declared ? validateV2SettingValue(declared, value) : null;
          if (invalid) throw new V2OperationError("input-invalid", invalid);
        }
        settings.writeRaw(settingKey(settingId), value);
      },
      reset(settingId?: string): void {
        require("settings:write");
        if (!args.settingsDeclarations) {
          throw new V2OperationError(
            "input-invalid",
            "Settings reset needs declared settings; this host did not supply declarations.",
          );
        }
        if (settingId !== undefined) {
          const declared = declaredSetting(settingId);
          if (declared) settings.writeRaw(settingKey(settingId), declared.defaultValue);
          return;
        }
        for (const declared of args.settingsDeclarations) {
          settings.writeRaw(settingKey(`${extensionId}.${declared.id}`), declared.defaultValue);
        }
      },
    },
    state: {
      read(key: string): unknown {
        checkKey(key, "State key");
        return extensionState.readAll(extensionId)[key];
      },
      write(key: string, value: unknown): void {
        checkKey(key, "State key");
        assertSerializable(value, `State ${JSON.stringify(key)}`);
        const current = extensionState.readAll(extensionId);
        extensionState.writeAll(extensionId, { ...current, [key]: value });
      },
      remove(key: string): void {
        checkKey(key, "State key");
        const current = extensionState.readAll(extensionId);
        if (!(key in current)) return;
        const next = { ...current };
        delete next[key];
        extensionState.writeAll(extensionId, next);
      },
    },
    jobs: {
      reportProgress(completed: number, total: number): void {
        jobs.reportProgress(completed, total);
      },
      throwIfCancelled(): void {
        jobs.throwIfCancelled();
      },
    },
    plans: {
      prepare(spec): { planId: string; expiresAt: string } {
        const binding = args.plans;
        if (!binding) {
          throw new V2OperationError(
            "input-invalid",
            "Review plans are not supported by this host binding.",
          );
        }
        const record = binding.manager.prepare(
          {
            extensionId,
            invocationId: args.invocationId,
            commandId: binding.commandId,
            effectivePermissions: [...effective],
            capabilities: [...binding.capabilities],
          },
          spec,
        );
        return { planId: record.planId, expiresAt: record.expiresAt };
      },
    },
    workspace: {
      ownedPaths(): string[] {
        return [...owned.keys()];
      },
      async dispose(): Promise<{ removed: string[] }> {
        const removed: string[] = [];
        for (const [path, version] of owned) {
          try {
            // Version-checked: a replacement at this path is not ours.
            if ((await files.deleteFileIfVersion(path, version)).removed) removed.push(path);
          } catch {
            continue;
          }
        }
        owned.clear();
        return { removed };
      },
    },
  };
}

/** Deny-all services for hosts without an operation factory: every call fails closed. */
export function denyAllV2Operations(extensionId: string): V2OperationServices {
  const deny = (): never => {
    throw denied("library:read", extensionId);
  };
  const denyAsync = async (): Promise<never> => deny();
  return {
    library: {
      getFile: () => deny(),
      listPage: () => deny(),
    },
    selection: {
      sourceNames: () => [],
      resolveSource: () => denyAsync(),
    },
    files: {
      readFile: () => denyAsync(),
      copyToOutput: () => denyAsync(),
      createOutputText: () => denyAsync(),
      copyFromSource: () => denyAsync(),
    },
    archive: {
      createZip: () => denyAsync(),
    },
    settings: {
      get: () => deny(),
      set: () => deny(),
      reset: () => deny(),
    },
    state: {
      read: () => deny(),
      write: () => deny(),
      remove: () => deny(),
    },
    jobs: {
      reportProgress: () => {},
      throwIfCancelled: () => {},
    },
    plans: {
      prepare: () => deny(),
    },
    workspace: {
      ownedPaths: () => [],
      dispose: async () => ({ removed: [] }),
    },
  };
}
