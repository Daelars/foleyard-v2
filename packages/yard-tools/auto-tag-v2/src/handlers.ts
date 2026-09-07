import {
  extendedOperationsOf,
  immediateV2Result,
  isV2JobCancellation,
  V2OperationError,
  type ExtensionV2Host,
  type V2HandlerContext,
} from "yard-core";

import { AUTO_TAG_V2_ID, AUTO_TAG_V2_PREVIEW, AUTO_TAG_V2_TAG_FILES } from "./definition";
import { MAX_TAG_FILES, tagsForFilename, unmatchedTokens } from "./rules";

/**
 * Auto Tag v2 command handlers (Yard Tools context, #190).
 *
 * Deterministic filename-rule tagging through the v2 tag operations, so
 * every write lands marked deterministic and manual tags stay
 * untouchable (the repository upgrades to manual, never away from it).
 *
 * - `preview` settles immediately: plan lines, untagged files, and the
 *   distinct uncovered words feeding the candidate queue. No writes.
 * - `tag-files` in `direct` mode tags synchronously and settles
 *   immediately; in `job` mode it walks the files with progress and
 *   honours cancellation, settling when the walk completes. Unknown IDs
 *   report as missing and per-file failures carry reasons; neither
 *   fails the whole run.
 */

export type AutoTagV2PreviewResult = {
  planned: string[];
  untaggedFileIds: string[];
  candidates: string[];
  missing: string[];
  taggedCount: number;
};

export type AutoTagV2TagFilesResult = {
  tagged: number;
  attached: number;
  skipped: string[];
  missing: string[];
  failedFiles: string[];
  failedReasons: string[];
};

function readFileIds(ctx: V2HandlerContext): string[] {
  const raw =
    typeof ctx.invocation.input === "object" && ctx.invocation.input !== null
      ? (ctx.invocation.input as Record<string, unknown>)
      : {};
  const seen = new Set<string>();
  const fileIds: string[] = [];
  for (const id of Array.isArray(raw.fileIds) ? raw.fileIds : []) {
    if (typeof id === "string" && id.length > 0 && !seen.has(id)) {
      seen.add(id);
      fileIds.push(id);
    }
  }
  if (fileIds.length === 0) {
    throw new V2OperationError(
      "input-invalid",
      "No sounds were provided; pass fileIds and retry.",
    );
  }
  if (fileIds.length > MAX_TAG_FILES) {
    throw new V2OperationError(
      "input-invalid",
      `This batch holds ${fileIds.length} sounds; the limit is ${MAX_TAG_FILES}. Tag fewer sounds and retry.`,
    );
  }
  return fileIds;
}

type LiveTagFile = { fileId: string; filename: string };

/** Resolve IDs against the Library index; unknown IDs report as missing, never silent. */
function resolveLiveFiles(ctx: V2HandlerContext, fileIds: string[]): { live: LiveTagFile[]; missing: string[] } {
  const live: LiveTagFile[] = [];
  const missing: string[] = [];
  for (const id of fileIds) {
    const record = ctx.operations.library.getFile(id);
    if (!record) {
      missing.push(id);
      continue;
    }
    live.push({ fileId: record.id, filename: record.filename || `${record.id}.bin` });
  }
  return { live, missing };
}

export function runPreview(ctx: V2HandlerContext) {
  const { live, missing } = resolveLiveFiles(ctx, readFileIds(ctx));
  const planned: string[] = [];
  const untaggedFileIds: string[] = [];
  const candidateSet = new Set<string>();
  for (const file of live) {
    const tags = tagsForFilename(file.filename);
    if (tags.length === 0) {
      untaggedFileIds.push(file.fileId);
    } else {
      planned.push(`${file.filename} -> ${tags.join(", ")}`);
    }
    for (const word of unmatchedTokens(file.filename)) {
      if (candidateSet.size >= 50) break;
      candidateSet.add(word);
    }
  }
  return immediateV2Result({
    planned,
    untaggedFileIds,
    candidates: [...candidateSet].sort(),
    missing,
    taggedCount: planned.length,
  } satisfies AutoTagV2PreviewResult);
}

export async function runTagFiles(ctx: V2HandlerContext) {
  const { live, missing } = resolveLiveFiles(ctx, readFileIds(ctx));
  const { tags } = extendedOperationsOf(ctx);
  const skipped: string[] = [];
  const failedFiles: string[] = [];
  const failedReasons: string[] = [];
  let tagged = 0;
  let attached = 0;
  let done = 0;

  const known = new Map(tags.list().map((tag) => [tag.name, tag.id]));
  const tagIdFor = (name: string): string => {
    const existing = known.get(name);
    if (existing) return existing;
    const created = tags.create(name).id;
    known.set(name, created);
    return created;
  };

  for (const file of live) {
    try {
      ctx.operations.jobs.throwIfCancelled();
    } catch (error) {
      if (isV2JobCancellation(error)) throw error;
      throw error;
    }
    const names = tagsForFilename(file.filename);
    if (names.length === 0) {
      skipped.push(file.filename);
      done += 1;
      ctx.operations.jobs.reportProgress(done, live.length);
      continue;
    }
    try {
      let fileTagged = false;
      for (const name of names) {
        tags.attach(file.fileId, tagIdFor(name), "deterministic");
        attached += 1;
        fileTagged = true;
      }
      if (fileTagged) tagged += 1;
    } catch (error) {
      if (isV2JobCancellation(error)) throw error;
      failedFiles.push(file.filename);
      failedReasons.push(`"${file.filename}": ${error instanceof Error ? error.message : String(error)}`);
    }
    done += 1;
    ctx.operations.jobs.reportProgress(done, live.length);
  }

  return immediateV2Result({
    tagged,
    attached,
    skipped,
    missing,
    failedFiles,
    failedReasons,
  } satisfies AutoTagV2TagFilesResult);
}

/** Register both auto-tag commands on a v2 host. */
export function registerAutoTagV2Handlers(host: ExtensionV2Host): void {
  host.registerHandler(AUTO_TAG_V2_ID, AUTO_TAG_V2_PREVIEW, runPreview);
  host.registerHandler(AUTO_TAG_V2_ID, AUTO_TAG_V2_TAG_FILES, (ctx) => runTagFiles(ctx));
}
