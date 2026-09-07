import {
  extendedOperationsOf,
  immediateV2Result,
  isV2JobCancellation,
  reviewV2Result,
  V2OperationError,
  type ExtensionV2Host,
  type V2HandlerContext,
} from "yard-core";

import {
  FOLDER_JANITOR_V2_DELETE_FOLDERS,
  FOLDER_JANITOR_V2_ID,
  FOLDER_JANITOR_V2_REMOVE_FILES,
  FOLDER_JANITOR_V2_SCAN_FOLDER,
  FOLDER_JANITOR_V2_SCAN_LIBRARY,
} from "./definition";
import {
  deriveIndexIssues,
  DEFAULT_ALLOWED_FORMATS,
  DEFAULT_TINY_THRESHOLD_BYTES,
  MAX_FOLDER_LISTINGS,
  MAX_SCAN_RECORDS,
  normalizePath,
  parseAllowedFormats,
  toReportArrays,
  type JanitorIssue,
  type JanitorRecord,
} from "./policy";

/**
 * Folder Janitor v2 command handlers (Yard Tools context, J4 #179).
 *
 * Scans read the Library index (paged) and walk folders through the
 * bounded folder-listing op, reporting progress and honoring
 * cancellation; they never touch disk directly. `remove-files` marks
 * index IDs removed through the library-mutation op. `delete-folders`
 * is destructive: `direct` previews a review plan, `apply` deletes each
 * empty folder through the authorized delete op, which rechecks
 * Library-root containment and emptiness at delete time. No v1 imports,
 * no recursive `rmdir`, no `fs.stat`.
 */

export type FolderJanitorV2ScanResult = {
  scannedFiles: number;
  scannedRoots: string[];
  issueKinds: string[];
  issuePaths: string[];
  issueMessages: string[];
  issueFileIds: string[];
  truncated: boolean;
};

export type FolderJanitorV2RemoveResult = {
  removed: number;
  marked: string[];
  unknownIds: string[];
};

export type FolderJanitorV2DeleteResult = {
  deleted: number;
  deletedPaths: string[];
  failedPaths: string[];
  failedReasons: string[];
};

function readScanOptions(ctx: V2HandlerContext): {
  tinyThresholdBytes: number;
  allowedFormats: Set<string>;
} {
  const raw =
    typeof ctx.invocation.input === "object" && ctx.invocation.input !== null
      ? (ctx.invocation.input as Record<string, unknown>)
      : {};
  const settingsThreshold = ctx.operations.settings.get(
    "folder-janitor-v2.tiny-file-threshold-bytes",
    DEFAULT_TINY_THRESHOLD_BYTES,
  );
  const settingsFormats = ctx.operations.settings.get(
    "folder-janitor-v2.allowed-formats",
    DEFAULT_ALLOWED_FORMATS,
  );
  const threshold =
    typeof raw.tinyFileThresholdBytes === "number"
      ? raw.tinyFileThresholdBytes
      : typeof settingsThreshold === "number"
        ? settingsThreshold
        : DEFAULT_TINY_THRESHOLD_BYTES;
  const formats =
    typeof raw.allowedFormats === "string" && raw.allowedFormats.trim()
      ? raw.allowedFormats
      : typeof settingsFormats === "string"
        ? settingsFormats
        : DEFAULT_ALLOWED_FORMATS;
  return {
    tinyThresholdBytes: Math.max(0, Math.floor(threshold)),
    allowedFormats: parseAllowedFormats(formats),
  };
}

/** Page the Library index into flat records, honoring cancellation. */
async function collectRecords(
  ctx: V2HandlerContext,
  filterUnderRoot: string | null,
): Promise<{ records: JanitorRecord[]; roots: Set<string>; truncated: boolean }> {
  const records: JanitorRecord[] = [];
  const roots = new Set<string>();
  const underRoot = filterUnderRoot ? normalizePath(filterUnderRoot) : null;
  let cursor: string | null = null;
  let truncated = false;
  do {
    ctx.operations.jobs.throwIfCancelled();
    const page = ctx.operations.library.listPage(cursor, 500);
    for (const file of page.files) {
      if (file.removedAt !== null) continue;
      const normalized = normalizePath(file.path);
      if (underRoot && !(normalized === underRoot || normalized.startsWith(`${underRoot}/`))) {
        continue;
      }
      if (file.libraryRoot) roots.add(file.libraryRoot);
      records.push({
        id: file.id,
        filename: file.filename,
        path: file.path,
        format: file.format ?? null,
        fileSize: file.fileSize ?? null,
      });
      if (records.length >= MAX_SCAN_RECORDS) {
        truncated = true;
        break;
      }
    }
    cursor = truncated ? null : page.nextCursor;
  } while (cursor !== null);
  return { records, roots, truncated };
}

/**
 * Walk folders under one root through the bounded listing op, collecting
 * present file paths (normalized) and empty folders. Mirrors v1: a
 * folder with no files and only empty subfolders is itself empty.
 * Returns whether the subtree held any file. Bounded by a listing
 * budget so a pathological tree cannot run forever.
 */
async function walkFolder(
  ctx: V2HandlerContext,
  folderPath: string,
  present: Set<string>,
  emptyFolders: string[],
  budget: { remaining: number },
): Promise<{ hasFile: boolean; complete: boolean }> {
  ctx.operations.jobs.throwIfCancelled();
  if (budget.remaining <= 0) return { hasFile: true, complete: false };
  const subdirs: string[] = [];
  let hasFile = false;
  let complete = true;
  let cursor: number | undefined = 0;
  const { folders } = extendedOperationsOf(ctx);
  do {
    if (budget.remaining <= 0) {
      complete = false;
      break;
    }
    budget.remaining -= 1;
    ctx.operations.jobs.throwIfCancelled();
    let page;
    try {
      page = await folders.listFolder({ path: folderPath, cursor });
    } catch {
      // An unreadable/vanished folder is not walked; the missing-file
      // pass reports its indexed contents instead.
      return { hasFile: true, complete: false };
    }
    for (const entry of page.entries) {
      if (entry.kind === "file") {
        hasFile = true;
        present.add(normalizePath(entry.path));
      } else {
        subdirs.push(entry.path);
      }
    }
    cursor = page.nextCursor ?? undefined;
  } while (cursor !== undefined);
  let childrenAllEmpty = true;
  for (const sub of subdirs) {
    const child = await walkFolder(ctx, sub, present, emptyFolders, budget);
    if (!child.complete) complete = false;
    if (child.hasFile) childrenAllEmpty = false;
  }
  if (!hasFile && childrenAllEmpty && complete) {
    emptyFolders.push(normalizePath(folderPath));
  }
  return { hasFile: hasFile || !childrenAllEmpty, complete };
}

async function runScan(ctx: V2HandlerContext, scope: "library" | "folder") {
  const options = readScanOptions(ctx);
  let root: string | null = null;
  if (scope === "folder") {
    root = ctx.invocation.selection.folderPath ?? null;
    if (!root) {
      throw new V2OperationError(
        "input-invalid",
        "Scan Folder needs a folder; open a folder and run the scan from its menu.",
      );
    }
  }
  const { records, roots, truncated: recordsTruncated } = await collectRecords(ctx, root);
  const issues: JanitorIssue[] = deriveIndexIssues(records, options);

  // Folder walk: empty folders + a present-path set for missing-file
  // detection. scan-folder walks the one folder; scan-library walks
  // every Library root the index references.
  const present = new Set<string>();
  const emptyFolders: string[] = [];
  const budget = { remaining: MAX_FOLDER_LISTINGS };
  const walkRoots = scope === "folder" && root ? [root] : [...roots];
  let walkComplete = true;
  const total = records.length + walkRoots.length;
  let done = records.length;
  ctx.operations.jobs.reportProgress(Math.min(done, total), total);
  for (const walkRoot of walkRoots) {
    const result = await walkFolder(ctx, walkRoot, present, emptyFolders, budget);
    if (!result.complete) walkComplete = false;
    done += 1;
    ctx.operations.jobs.reportProgress(Math.min(done, total), total);
  }
  for (const folder of emptyFolders) {
    issues.push({
      kind: "empty-folder",
      path: folder,
      fileIds: [],
      message: "Folder contains no files or non-empty folders.",
    });
  }
  // Missing-file: an indexed record whose path was not seen while its
  // containing tree was fully walked. Only reported when the walk of its
  // root completed, so an aborted or budget-capped walk never invents
  // false "missing" reports.
  if (walkComplete) {
    for (const record of records) {
      if (!present.has(normalizePath(record.path))) {
        issues.push({
          kind: "missing-file",
          path: record.path,
          fileIds: [record.id],
          message: "Indexed file was not found on disk.",
        });
      }
    }
  }

  const arrays = toReportArrays(issues);
  const scannedRoots = (scope === "folder" && root ? [root] : [...roots]).map((entry) =>
    normalizePath(entry),
  );
  return immediateV2Result({
    scannedFiles: records.length,
    scannedRoots,
    ...arrays,
    truncated: recordsTruncated || !walkComplete,
  } satisfies FolderJanitorV2ScanResult);
}

export function runScanLibrary(ctx: V2HandlerContext) {
  return runScan(ctx, "library");
}

export function runScanFolder(ctx: V2HandlerContext) {
  return runScan(ctx, "folder");
}

export function runRemoveFiles(ctx: V2HandlerContext) {
  const ids = ctx.files.map((file) => file.id);
  if (ids.length === 0) {
    throw new V2OperationError(
      "input-invalid",
      "Select at least one sound to remove from the index.",
    );
  }
  const { libraryMutations } = extendedOperationsOf(ctx);
  const { marked, unknownIds } = libraryMutations.markRemoved(ids);
  return immediateV2Result({
    removed: marked.length,
    marked,
    unknownIds,
  } satisfies FolderJanitorV2RemoveResult);
}

function readDeleteFolders(ctx: V2HandlerContext): string[] {
  const source =
    ctx.plan?.options && typeof ctx.plan.options === "object"
      ? (ctx.plan.options as Record<string, unknown>)
      : typeof ctx.invocation.input === "object" && ctx.invocation.input !== null
        ? (ctx.invocation.input as Record<string, unknown>)
        : {};
  const folders = source.folders;
  if (!Array.isArray(folders) || folders.length === 0) {
    throw new V2OperationError(
      "input-invalid",
      "Choose at least one empty folder to delete.",
    );
  }
  const clean: string[] = [];
  const seen = new Set<string>();
  for (const entry of folders) {
    if (typeof entry !== "string" || !entry.trim()) {
      throw new V2OperationError("input-invalid", "Every folder path must be a non-empty string.");
    }
    if (!seen.has(entry)) {
      seen.add(entry);
      clean.push(entry);
    }
  }
  return clean;
}

export async function runDeleteFolders(ctx: V2HandlerContext) {
  const folders = readDeleteFolders(ctx);
  if (ctx.runMode === "direct") {
    const summary = `Delete ${folders.length} empty folder${folders.length === 1 ? "" : "s"}`;
    const prepared = ctx.operations.plans.prepare({
      targets: { fileIds: [] },
      options: { folders },
      destructive: true,
      preview: {
        summary,
        tables: [
          {
            id: "folders",
            title: "Folders",
            columns: ["Folder"],
            rows: folders.map((folder) => [folder]),
          },
        ],
        notices: [
          {
            tone: "warning",
            message:
              "Only empty folders inside a Library root are deleted. Each folder is rechecked for emptiness and containment at delete time; anything else fails with a reason.",
          },
        ],
        reversibility: "irreversible-files",
        reversibilityNote:
          "Deleted folders are removed from disk and cannot be restored by this tool. Only empty folders are ever deleted.",
      },
    });
    return reviewV2Result(prepared.planId, summary, prepared.expiresAt);
  }

  const { folders: folderOps } = extendedOperationsOf(ctx);
  const deletedPaths: string[] = [];
  const failedPaths: string[] = [];
  const failedReasons: string[] = [];
  let done = 0;
  for (const folder of folders) {
    // Cancellation between folders stops further deletions and settles
    // the job as cancelled; folders already deleted stay deleted (there
    // is no partial state to roll back for a completed rmdir).
    ctx.operations.jobs.throwIfCancelled();
    try {
      const removed = await folderOps.deleteEmptyFolder({ path: folder });
      deletedPaths.push(removed.removed);
    } catch (error) {
      if (isV2JobCancellation(error)) throw error;
      failedPaths.push(folder);
      failedReasons.push(error instanceof Error ? error.message : String(error));
    }
    done += 1;
    ctx.operations.jobs.reportProgress(done, folders.length);
  }
  return immediateV2Result({
    deleted: deletedPaths.length,
    deletedPaths,
    failedPaths,
    failedReasons,
  } satisfies FolderJanitorV2DeleteResult);
}

/** Register all four janitor commands on a v2 host. */
export function registerFolderJanitorV2Handlers(host: ExtensionV2Host): void {
  host.registerHandler(FOLDER_JANITOR_V2_ID, FOLDER_JANITOR_V2_SCAN_LIBRARY, runScanLibrary);
  host.registerHandler(FOLDER_JANITOR_V2_ID, FOLDER_JANITOR_V2_SCAN_FOLDER, runScanFolder);
  host.registerHandler(FOLDER_JANITOR_V2_ID, FOLDER_JANITOR_V2_REMOVE_FILES, runRemoveFiles);
  host.registerHandler(FOLDER_JANITOR_V2_ID, FOLDER_JANITOR_V2_DELETE_FOLDERS, runDeleteFolders);
}
