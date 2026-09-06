import {
  extendedOperationsOf,
  immediateV2Result,
  isV2JobCancellation,
  V2OperationError,
  type ExtensionV2Host,
  type V2HandlerContext,
} from "yard-core";

import {
  LIBRARY_GATHERER_V2_GATHER,
  LIBRARY_GATHERER_V2_ID,
  LIBRARY_GATHERER_V2_PREVIEW,
} from "./definition";
import {
  audioExtensionSet,
  baseName,
  extensionOf,
  isAudioFile,
  MAX_GATHER_FILES,
  MAX_SOURCE_LISTINGS,
  plannedOutputName,
  reserveUniqueName,
  type PlannedGatherFile,
} from "./policy";

/**
 * Library Gatherer v2 command handlers (Yard Tools context, G5 #180).
 *
 * `preview-gather` lists readable source grants (bounded, cancellable),
 * filters audio files, and plans flat output names — no side effects.
 * `gather` copies each planned file into the destination grant through
 * the source-copy op (never overwrites: a name that already exists is
 * skipped or fails with a reason, per the skip-duplicates setting) and
 * inserts index records via the library-mutation op. Cancellation
 * disposes job-owned copies and settles honestly. No v1 imports, no
 * direct filesystem imports, no recursive copy — every effect goes
 * through the E1 #176 operation services.
 */

export type LibraryGathererV2PreviewResult = {
  candidates: number;
  sourcePaths: string[];
  outputNames: string[];
  sizes: string[];
  truncated: boolean;
};

export type LibraryGathererV2GatherResult = {
  copied: number;
  inserted: number;
  skipped: number;
  copiedPaths: string[];
  skippedSources: string[];
  skippedReasons: string[];
  failedSources: string[];
  failedReasons: string[];
};

type GatherSettings = {
  preserveFolderNames: boolean;
  skipDuplicates: boolean;
};

function readInput(ctx: V2HandlerContext): {
  sourceGrantIds: string[];
  destGrantId: string | null;
  settings: GatherSettings;
} {
  const raw =
    typeof ctx.invocation.input === "object" && ctx.invocation.input !== null
      ? (ctx.invocation.input as Record<string, unknown>)
      : {};
  const sourceGrantIds = Array.isArray(raw.sourceGrantIds)
    ? raw.sourceGrantIds.filter((id): id is string => typeof id === "string" && id.trim().length > 0)
    : [];
  if (sourceGrantIds.length === 0) {
    throw new V2OperationError(
      "input-invalid",
      "Choose at least one source folder to gather from.",
    );
  }
  const settingPreserve = ctx.operations.settings.get(
    "library-gatherer-v2.preserve-folder-names",
    true,
  );
  const settingSkip = ctx.operations.settings.get("library-gatherer-v2.skip-duplicates", true);
  const preserveFolderNames =
    typeof raw.preserveFolderNames === "boolean"
      ? raw.preserveFolderNames
      : typeof settingPreserve === "boolean"
        ? settingPreserve
        : true;
  const skipDuplicates =
    typeof raw.skipDuplicates === "boolean"
      ? raw.skipDuplicates
      : typeof settingSkip === "boolean"
        ? settingSkip
        : true;
  return {
    sourceGrantIds,
    destGrantId: typeof raw.destGrantId === "string" && raw.destGrantId.trim() ? raw.destGrantId : null,
    settings: { preserveFolderNames, skipDuplicates },
  };
}

async function collectSourceFiles(
  ctx: V2HandlerContext,
  grantId: string,
  allowed: Set<string>,
  budget: { remaining: number },
): Promise<{ files: Array<{ sourcePath: string; filename: string; size: number }>; rootName: string; complete: boolean }> {
  const { folders } = extendedOperationsOf(ctx);
  const files: Array<{ sourcePath: string; filename: string; size: number }> = [];
  const queue: Array<string | undefined> = [undefined];
  let rootName = "";
  let complete = true;
  while (queue.length > 0) {
    const dir = queue.shift();
    let cursor: number | undefined = 0;
    do {
      if (budget.remaining <= 0) {
        complete = false;
        break;
      }
      budget.remaining -= 1;
      ctx.operations.jobs.throwIfCancelled();
      let page;
      try {
        page = await folders.listFolder(
          dir === undefined ? { grantId, cursor } : { grantId, path: dir, cursor },
        );
      } catch {
        complete = false;
        break;
      }
      if (dir === undefined && !rootName) rootName = baseName(page.root);
      for (const entry of page.entries) {
        if (entry.kind === "file") {
          if (isAudioFile(entry.name, allowed)) {
            files.push({ sourcePath: entry.path, filename: entry.name, size: entry.size ?? 0 });
          }
        } else {
          queue.push(entry.path);
        }
      }
      cursor = page.nextCursor ?? undefined;
    } while (cursor !== undefined);
  }
  return { files, rootName, complete };
}

async function planGather(
  ctx: V2HandlerContext,
  sourceGrantIds: string[],
  settings: GatherSettings,
): Promise<{ planned: PlannedGatherFile[]; truncated: boolean }> {
  const allowed = audioExtensionSet();
  const budget = { remaining: MAX_SOURCE_LISTINGS };
  const used = new Set<string>();
  const planned: PlannedGatherFile[] = [];
  let truncated = false;
  for (const grantId of sourceGrantIds) {
    const { files, rootName, complete } = await collectSourceFiles(ctx, grantId, allowed, budget);
    if (!complete) truncated = true;
    for (const file of files) {
      if (planned.length >= MAX_GATHER_FILES) {
        truncated = true;
        break;
      }
      const outputName = reserveUniqueName(
        used,
        plannedOutputName(file.filename, rootName, settings.preserveFolderNames),
      );
      planned.push({
        sourceGrantId: grantId,
        sourcePath: file.sourcePath,
        outputName,
        size: file.size,
      });
    }
    if (planned.length >= MAX_GATHER_FILES) break;
  }
  return { planned, truncated };
}

export async function runPreviewGather(ctx: V2HandlerContext) {
  const { sourceGrantIds, settings } = readInput(ctx);
  const { planned, truncated } = await planGather(ctx, sourceGrantIds, settings);
  return immediateV2Result({
    candidates: planned.length,
    sourcePaths: planned.map((file) => file.sourcePath),
    outputNames: planned.map((file) => file.outputName),
    sizes: planned.map((file) => String(file.size)),
    truncated,
  } satisfies LibraryGathererV2PreviewResult);
}

export async function runGather(ctx: V2HandlerContext) {
  const { sourceGrantIds, destGrantId, settings } = readInput(ctx);
  if (!destGrantId) {
    throw new V2OperationError(
      "input-invalid",
      "Choose a destination library folder to gather into.",
    );
  }
  const { planned, truncated } = await planGather(ctx, sourceGrantIds, settings);

  const copiedPaths: string[] = [];
  const skippedSources: string[] = [];
  const skippedReasons: string[] = [];
  const failedSources: string[] = [];
  const failedReasons: string[] = [];
  const insertRecords: Array<{ path: string; filename: string; fileSize: number }> = [];

  const now = new Date().toISOString();
  const nowMs = Date.now();
  const total = planned.length;
  let done = 0;

  try {
    for (const file of planned) {
      ctx.operations.jobs.throwIfCancelled();
      try {
        const created = await ctx.operations.files.copyFromSource(
          file.sourceGrantId,
          file.sourcePath,
          file.outputName,
          destGrantId,
        );
        copiedPaths.push(created.path);
        insertRecords.push({ path: created.path, filename: file.outputName, fileSize: file.size });
      } catch (error) {
        if (isV2JobCancellation(error)) throw error;
        const reason = error instanceof Error ? error.message : String(error);
        // The source-copy op never overwrites: an existing destination
        // name reports as a skipped duplicate (skip-duplicates on) or a
        // failure with a reason (skip-duplicates off), never a silent
        // overwrite.
        if (/already exists/i.test(reason)) {
          if (settings.skipDuplicates) {
            skippedSources.push(file.sourcePath);
            skippedReasons.push("A file with that name already exists in the destination.");
          } else {
            failedSources.push(file.sourcePath);
            failedReasons.push(reason);
          }
        } else {
          failedSources.push(file.sourcePath);
          failedReasons.push(reason);
        }
      }
      done += 1;
      ctx.operations.jobs.reportProgress(done, total);
    }
  } catch (error) {
    // Cancellation removes the job-owned copies made so far, then
    // rethrows so the job settles as cancelled (never a partial success).
    if (isV2JobCancellation(error)) {
      await ctx.operations.workspace.dispose();
      throw error;
    }
    throw error;
  }

  // Index the successful copies. insertGathered is bounded per call, so
  // insert in chunks; a chunk failure is reported without discarding the
  // copies that did land.
  const { libraryMutations } = extendedOperationsOf(ctx);
  let inserted = 0;
  for (let start = 0; start < insertRecords.length; start += MAX_GATHER_FILES) {
    const chunk = insertRecords.slice(start, start + MAX_GATHER_FILES);
    try {
      const result = libraryMutations.insertGathered(
        chunk.map((record) => ({
          path: record.path,
          filename: record.filename,
          libraryRoot: null,
          directory: null,
          format: extensionOf(record.filename) || null,
          codec: null,
          duration: null,
          sampleRate: null,
          bitDepth: null,
          channels: null,
          fileSize: record.fileSize,
          mtimeMs: nowMs,
          removedAt: null,
          lastScannedAt: now,
        })),
      );
      inserted += result.inserted;
    } catch (error) {
      for (const record of chunk) {
        failedSources.push(record.path);
        failedReasons.push(
          `Copied but not indexed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  if (truncated) {
    failedReasons.push(
      `Gather was capped at ${MAX_GATHER_FILES} files; narrow the sources and gather again for the rest.`,
    );
    failedSources.push("(gather truncated)");
  }

  return immediateV2Result({
    copied: copiedPaths.length,
    inserted,
    skipped: skippedSources.length,
    copiedPaths,
    skippedSources,
    skippedReasons,
    failedSources,
    failedReasons,
  } satisfies LibraryGathererV2GatherResult);
}

/** Register both gather commands on a v2 host. */
export function registerLibraryGathererV2Handlers(host: ExtensionV2Host): void {
  host.registerHandler(LIBRARY_GATHERER_V2_ID, LIBRARY_GATHERER_V2_PREVIEW, runPreviewGather);
  host.registerHandler(LIBRARY_GATHERER_V2_ID, LIBRARY_GATHERER_V2_GATHER, runGather);
}
