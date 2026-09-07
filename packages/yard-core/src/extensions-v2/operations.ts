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
 * created path is tracked, and `workspace.dispose` removes only tracked
 * paths. Unrelated files are never overwritten (conflicting names fail)
 * or deleted.
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
  copyFile(sourceCanonical: string, destCanonical: string): Promise<void>;
  writeFileBytes(destCanonical: string, bytes: Uint8Array): Promise<void>;
  deleteFile(canonicalPath: string): Promise<void>;
  exists(canonicalPath: string): Promise<boolean>;
  /** Configured readable Library roots. */
  libraryRoots(): readonly string[] | Promise<readonly string[]>;
  pathIo(): V2PathIo;
};

export type V2ArchiveEntry =
  | { name: string; sourcePath: string }
  | { name: string; text: string };

export type V2ArchivePorts = {
  createZipArchive(
    entries: readonly V2ArchiveEntry[],
    destPath: string,
  ): Promise<{ bytesWritten: number }>;
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
   * grant's root and must not already exist (never overwrites). The
   * created path is tracked for job-owned cleanup.
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
  const owned = new Set<string>();
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

  const liveRecord = (fileId: string): IndexedAudioFile => {
    const record = library.getFileById(fileId);
    if (!record || record.removedAt !== null) {
      throw new V2OperationError(
        "input-invalid",
        `Sound ${JSON.stringify(fileId)} is not in the Library index; refresh the selection and retry.`,
      );
    }
    return record;
  };

  const readableSource = async (record: IndexedAudioFile): Promise<string> => {
    const roots = await files.libraryRoots();
    const authorized = await authorizeV2ReadablePath(record.path, roots, files.pathIo());
    if (!authorized.ok) {
      throw new V2OperationError("permission-denied", `Sound ${JSON.stringify(record.id)} is not readable: ${authorized.message}`);
    }
    return authorized.canonicalPath;
  };

  const writableDestination = async (grantId: string, name: string): Promise<string> => {
    const authorized = grants.authorize(grantId, extensionId, args.now);
    if (!authorized.ok) {
      throw new V2OperationError("permission-denied", authorized.message);
    }
    const candidate = `${authorized.grant.rootPath.replace(/[\\/]+$/, "")}/${name}`;
    const resolved = await authorizeV2WritablePath(candidate, authorized.grant.rootPath, files.pathIo());
    if (!resolved.ok) {
      throw new V2OperationError("permission-denied", `Output ${JSON.stringify(name)} is not writable: ${resolved.message}`);
    }
    if (await files.exists(resolved.canonicalPath)) {
      throw new V2OperationError(
        "input-invalid",
        `Output ${JSON.stringify(name)} already exists in the destination; choose another name. Existing files are never overwritten.`,
      );
    }
    return resolved.canonicalPath;
  };

  const track = (canonicalPath: string): void => {
    owned.add(canonicalPath);
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
        const dest = await writableDestination(grantId, outputName);
        await files.copyFile(canonical, dest);
        track(dest);
        return { path: dest };
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
        const dest = await writableDestination(grantId, name);
        await files.writeFileBytes(dest, bytes);
        track(dest);
        return { path: dest };
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
        const dest = await writableDestination(destGrantId, outputName);
        await files.copyFile(source.canonicalPath, dest);
        track(dest);
        return { path: dest };
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
        const dest = await writableDestination(grantId, name);
        await archive.createZipArchive(entries, dest);
        track(dest);
        return { path: dest, entries: entries.length };
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
        return [...owned];
      },
      async dispose(): Promise<{ removed: string[] }> {
        const removed: string[] = [];
        for (const path of owned) {
          try {
            if (await files.exists(path)) await files.deleteFile(path);
            removed.push(path);
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
