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
  MAX_SCAN_ISSUE_DETAILS,
  MAX_SCAN_RECORDS,
  MAX_SCAN_TRUNCATION_REASONS,
  normalizePath,
  parseAllowedFormats,
  summarizeIssueKinds,
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
 *
 * Honesty (#285): a scan reports its reviewed scope (`scannedRoots`,
 * `scannedFiles`), and when any bound cut the review short it sets
 * `truncated` and names the exact reason in `truncationReasons` — a
 * partial report is never presented as a complete or clean one.
 * `delete-folders` deletes exactly the folders the reviewed plan lists
 * and accounts for every one of them in its result (`reviewed` ==
 * `deleted` + `failedPaths`); the reviewed scope is the only scope, and
 * a fresh apply prepares a fresh plan.
 */

export type FolderJanitorV2ScanResult = {
  scannedFiles: number;
  scannedRoots: string[];
  issueKinds: string[];
  issuePaths: string[];
  issueMessages: string[];
  issueFileIds: string[];
  /** Total issues found; stays accurate even when the detail arrays are bounded. */
  issueTotal: number;
  /** Per-kind counts as `"kind=count"` strings (see `summarizeIssueKinds`). */
  issueSummary: string[];
  /** True when any scan bound cut the review short. */
  truncated: boolean;
  /** Why the review is incomplete; empty when `truncated` is false. */
  truncationReasons: string[];
};

export type FolderJanitorV2RemoveResult = {
  removed: number;
  marked: string[];
  unknownIds: string[];
};

export type FolderJanitorV2DeleteResult = {
  /** Folders in the reviewed plan. `deleted` + `failedPaths.length` == this. */
  reviewed: number;
  deleted: number;
  deletedPaths: string[];
  failedPaths: string[];
  failedReasons: string[];
};

/** Exact reason the record cap truncated a scan; names the bound. */
function recordCapReason(): string {
  return `Reached the ${MAX_SCAN_RECORDS}-file scan cap, so later indexed files were not reviewed. Narrow the scope or rescan for a complete report.`;
}

/** Exact reason the folder-walk budget truncated a scan; names the bound. */
function listingBudgetReason(): string {
  return `Reached the ${MAX_FOLDER_LISTINGS}-listing folder walk budget, so part of the folder tree was not reviewed. Narrow the scope or rescan for a complete report.`;
}

/** Exact reason an unlistable folder truncated a scan. */
function unlistedFolderReason(path: string): string {
  return `Folder ${JSON.stringify(path)} could not be listed, so part of the folder tree was not reviewed.`;
}

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
): Promise<{ records: JanitorRecord[]; roots: Set<string>; reason: string | null }> {
  const records: JanitorRecord[] = [];
  const roots = new Set<string>();
  const underRoot = filterUnderRoot ? normalizePath(filterUnderRoot) : null;
  let cursor: string | null = null;
  let reason: string | null = null;
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
        reason = recordCapReason();
        break;
      }
    }
    if (reason) break;
    // During index paging the page count total is not knowable, so report
    // completed == total (the renderer shows the running count), then real
    // totals once the folder walk knows its roots.
    ctx.operations.jobs.reportProgress(records.length, records.length);
    cursor = page.nextCursor;
  } while (cursor !== null);
  return { records, roots, reason };
}

/**
 * Walk folders under one root through the bounded listing op, collecting
 * present file paths (normalized) and empty folders. Mirrors v1: a
 * folder with no files and only empty subfolders is itself empty.
 * Returns whether the subtree held any file. Bounded by a listing
 * budget so a pathological tree cannot run forever; every bound that
 * cuts the walk short adds a truncation reason.
 */
async function walkFolder(
  ctx: V2HandlerContext,
  folderPath: string,
  present: Set<string>,
  emptyFolders: string[],
  budget: { remaining: number },
  reasons: Set<string>,
): Promise<{ hasFile: boolean; complete: boolean }> {
  ctx.operations.jobs.throwIfCancelled();
  if (budget.remaining <= 0) {
    reasons.add(listingBudgetReason());
    return { hasFile: true, complete: false };
  }
  const subdirs: string[] = [];
  let hasFile = false;
  let complete = true;
  let cursor: number | undefined = 0;
  const { folders } = extendedOperationsOf(ctx);
  do {
    if (budget.remaining <= 0) {
      reasons.add(listingBudgetReason());
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
      reasons.add(unlistedFolderReason(folderPath));
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
    const child = await walkFolder(ctx, sub, present, emptyFolders, budget, reasons);
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
  const collected = await collectRecords(ctx, root);
  const records = collected.records;
  const roots = collected.roots;
  const issues: JanitorIssue[] = deriveIndexIssues(records, options);
  const reasons = new Set<string>();
  if (collected.reason) reasons.add(collected.reason);

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
    const result = await walkFolder(ctx, walkRoot, present, emptyFolders, budget, reasons);
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

  const arrays = toReportArrays(issues.slice(0, MAX_SCAN_ISSUE_DETAILS));
  const scannedRoots = (scope === "folder" && root ? [root] : [...roots]).map((entry) =>
    normalizePath(entry),
  );
  const truncationReasons = [...reasons].slice(0, MAX_SCAN_TRUNCATION_REASONS);
  if (reasons.size > MAX_SCAN_TRUNCATION_REASONS) {
    truncationReasons.push(
      `…and ${reasons.size - MAX_SCAN_TRUNCATION_REASONS} more reason(s) the review was incomplete; narrow the scope and rescan.`,
    );
  }
  return immediateV2Result({
    scannedFiles: records.length,
    scannedRoots,
    ...arrays,
    issueTotal: issues.length,
    issueSummary: summarizeIssueKinds(issues),
    truncated: truncationReasons.length > 0,
    truncationReasons,
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
  // Applying deletes exactly the reviewed scope: on apply the folders come
  // from the host-validated plan record, never from a fresh client payload.
  if (ctx.runMode === "apply" && !ctx.plan) {
    throw new V2OperationError(
      "input-invalid",
      "Delete Folders must be applied from a reviewed plan; prepare and review one first.",
    );
  }
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
            title: "Folders to delete",
            columns: ["Folder"],
            rows: folders.map((folder) => [folder]),
          },
        ],
        notices: [
          {
            tone: "warning",
            message:
              "This review lists every folder that will be deleted. Applying removes exactly these folders, after rechecking that each is still empty and still inside a Library root; anything else fails with a reason.",
          },
        ],
        details: { folders, reviewedCount: folders.length },
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
    // is no partial state to roll back for a completed rmdir), and the
    // next run re-checks each folder so the remaining work is recoverable.
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
    reviewed: folders.length,
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
