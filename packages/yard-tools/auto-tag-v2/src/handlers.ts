import {
  extendedOperationsOf,
  immediateV2Result,
  isV2JobCancellation,
  STUB_EMBEDDING_MODEL,
  V2OperationError,
  type ExtensionV2Host,
  type V2HandlerContext,
} from "yard-core";

import {
  AUTO_TAG_V2_DISMISS_CANDIDATE,
  AUTO_TAG_V2_FIND_SIMILAR,
  AUTO_TAG_V2_ID,
  AUTO_TAG_V2_LIST_CANDIDATES,
  AUTO_TAG_V2_PREVIEW,
  AUTO_TAG_V2_PROMOTE_CANDIDATE,
  AUTO_TAG_V2_TAG_FILES,
} from "./definition";
import {
  MAX_CANDIDATES,
  MAX_QUEUE_FILES,
  MAX_TAG_FILES,
  cleanCandidateWord,
  collectCandidates,
  filenameMatchesToken,
  tagsForFilename,
  unmatchedTokens,
} from "./rules";

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

export type AutoTagV2ListCandidatesResult = {
  words: string[];
  lines: string[];
  truncated: boolean;
  totalFiles: number;
};

export type AutoTagV2PromoteCandidateResult = {
  tag: string;
  tagId: string;
  attached: number;
  missing: string[];
};

export type AutoTagV2DismissCandidateResult = {
  word: string;
  dismissedCount: number;
};

const DISMISSED_KEY = "dismissed-candidates";

function readDismissed(ctx: V2HandlerContext): Set<string> {
  const raw: unknown = ctx.operations.state.read(DISMISSED_KEY);
  return new Set(
    Array.isArray(raw) ? raw.filter((word): word is string => typeof word === "string") : [],
  );
}

function writeDismissed(ctx: V2HandlerContext, dismissed: Set<string>): void {
  ctx.operations.state.write(DISMISSED_KEY, [...dismissed].sort());
}

function readCandidateWord(ctx: V2HandlerContext): string {
  const raw =
    typeof ctx.invocation.input === "object" && ctx.invocation.input !== null
      ? (ctx.invocation.input as Record<string, unknown>)
      : {};
  const word = cleanCandidateWord(raw.word);
  if (!word) {
    throw new V2OperationError(
      "input-invalid",
      "No usable word was provided; pass a word of at least 3 letters and retry.",
    );
  }
  return word;
}

export function runListCandidates(ctx: V2HandlerContext) {
  const raw =
    typeof ctx.invocation.input === "object" && ctx.invocation.input !== null
      ? (ctx.invocation.input as Record<string, unknown>)
      : {};
  const limit = Math.max(
    1,
    Math.min(
      MAX_QUEUE_FILES,
      typeof raw.limit === "number" && Number.isInteger(raw.limit) ? raw.limit : MAX_QUEUE_FILES,
    ),
  );
  const dismissed = readDismissed(ctx);
  const { tags } = extendedOperationsOf(ctx);
  // Words that already exist as tags are handled: the queue only holds
  // uncovered, untagged words, so a promoted word never nags again.
  const handled = new Set([...dismissed, ...tags.list().map((tag) => tag.name.toLowerCase())]);
  const seen: Array<{ id: string; filename: string }> = [];
  let cursor: string | null = null;
  let exhausted = false;
  while (seen.length < limit) {
    const page = ctx.operations.library.listPage(cursor, Math.min(500, limit - seen.length));
    for (const file of page.files) {
      if (file.removedAt !== null) continue;
      seen.push({ id: file.id, filename: file.filename || `${file.id}.bin` });
      if (seen.length >= limit) break;
    }
    if (!page.nextCursor) {
      exhausted = true;
      break;
    }
    cursor = page.nextCursor;
  }
  const entries = collectCandidates(seen, undefined, handled, MAX_CANDIDATES);
  return immediateV2Result({
    words: entries.map((entry) => entry.word),
    lines: entries.map(
      (entry) =>
        `${entry.word} — ${entry.fileCount} file${entry.fileCount === 1 ? "" : "s"}, e.g. ${entry.exampleFilename}`,
    ),
    truncated: !exhausted,
    totalFiles: seen.length,
  } satisfies AutoTagV2ListCandidatesResult);
}

export async function runPromoteCandidate(ctx: V2HandlerContext) {
  const word = readCandidateWord(ctx);
  const raw =
    typeof ctx.invocation.input === "object" && ctx.invocation.input !== null
      ? (ctx.invocation.input as Record<string, unknown>)
      : {};
  const explicitIds = Array.isArray(raw.fileIds)
    ? raw.fileIds.filter((id): id is string => typeof id === "string" && id.length > 0)
    : [];
  const { tags } = extendedOperationsOf(ctx);

  const targets: LiveTagFile[] = [];
  const missing: string[] = [];
  if (explicitIds.length > 0) {
    const resolved = resolveLiveFiles(ctx, explicitIds);
    targets.push(...resolved.live);
    missing.push(...resolved.missing);
  } else {
    let cursor: string | null = null;
    while (targets.length < MAX_TAG_FILES) {
      const page = ctx.operations.library.listPage(cursor, 500);
      for (const file of page.files) {
        if (file.removedAt !== null) continue;
        const filename = file.filename || `${file.id}.bin`;
        if (filenameMatchesToken(filename, word)) {
          targets.push({ fileId: file.id, filename });
          if (targets.length >= MAX_TAG_FILES) break;
        }
      }
      if (!page.nextCursor) break;
      cursor = page.nextCursor;
    }
  }

  const known = new Map(tags.list().map((tag) => [tag.name, tag.id]));
  let tagId = known.get(word);
  if (!tagId) {
    tagId = tags.create(word).id;
    known.set(word, tagId);
  }
  let attached = 0;
  for (const file of targets) {
    // Promoted words are user-approved, so they attach as manual.
    tags.attach(file.fileId, tagId, "manual");
    attached += 1;
  }

  const dismissed = readDismissed(ctx);
  if (dismissed.delete(word)) writeDismissed(ctx, dismissed);

  return immediateV2Result({
    tag: word,
    tagId,
    attached,
    missing,
  } satisfies AutoTagV2PromoteCandidateResult);
}

export function runDismissCandidate(ctx: V2HandlerContext) {
  const word = readCandidateWord(ctx);
  const dismissed = readDismissed(ctx);
  dismissed.add(word);
  writeDismissed(ctx, dismissed);
  return immediateV2Result({
    word,
    dismissedCount: dismissed.size,
  } satisfies AutoTagV2DismissCandidateResult);
}

export function runFindSimilar(ctx: V2HandlerContext) {
  const raw =
    typeof ctx.invocation.input === "object" && ctx.invocation.input !== null
      ? (ctx.invocation.input as Record<string, unknown>)
      : {};
  const inputId = typeof raw.fileId === "string" && raw.fileId.length > 0 ? raw.fileId : null;
  const selectionIds = ctx.invocation.selection.fileIds.filter((id) => id.length > 0);
  const targetId = inputId ?? (selectionIds.length === 1 ? selectionIds[0]! : null);
  if (!targetId) {
    throw new V2OperationError(
      "input-invalid",
      "Select one sound to compare from, or pass its fileId.",
    );
  }
  const topN = Math.max(
    1,
    Math.min(
      50,
      typeof raw.topN === "number" && Number.isInteger(raw.topN) ? raw.topN : 10,
    ),
  );
  const target = ctx.operations.library.getFile(targetId);
  if (!target) {
    throw new V2OperationError(
      "input-invalid",
      `Sound ${JSON.stringify(targetId)} is not in the Library index; refresh the selection and retry.`,
    );
  }
  const { embeddings } = extendedOperationsOf(ctx);
  if (!embeddings.get(target.id, STUB_EMBEDDING_MODEL)) {
    return immediateV2Result({
      targetFileId: target.id,
      targetFilename: target.filename || `${target.id}.bin`,
      similarFileIds: [],
      similarFilenames: [],
      reason: "No embeddings stored yet, so there is nothing to compare. Similarity starts working once vectors land.",
    } satisfies AutoTagV2FindSimilarResult);
  }
  const ranked = embeddings.findSimilar(target.id, { topN });
  const similarFileIds: string[] = [];
  const similarFilenames: string[] = [];
  for (const entry of ranked) {
    const record = ctx.operations.library.getFile(entry.fileId);
    if (!record) continue;
    similarFileIds.push(record.id);
    similarFilenames.push(record.filename || `${record.id}.bin`);
  }
  return immediateV2Result({
    targetFileId: target.id,
    targetFilename: target.filename || `${target.id}.bin`,
    similarFileIds,
    similarFilenames,
  } satisfies AutoTagV2FindSimilarResult);
}

export type AutoTagV2FindSimilarResult = {
  targetFileId: string;
  targetFilename: string;
  similarFileIds: string[];
  similarFilenames: string[];
  reason?: string;
};

/** Register every auto-tag command on a v2 host. */
export function registerAutoTagV2Handlers(host: ExtensionV2Host): void {
  host.registerHandler(AUTO_TAG_V2_ID, AUTO_TAG_V2_PREVIEW, runPreview);
  host.registerHandler(AUTO_TAG_V2_ID, AUTO_TAG_V2_TAG_FILES, (ctx) => runTagFiles(ctx));
  host.registerHandler(AUTO_TAG_V2_ID, AUTO_TAG_V2_LIST_CANDIDATES, runListCandidates);
  host.registerHandler(AUTO_TAG_V2_ID, AUTO_TAG_V2_PROMOTE_CANDIDATE, (ctx) =>
    runPromoteCandidate(ctx),
  );
  host.registerHandler(AUTO_TAG_V2_ID, AUTO_TAG_V2_DISMISS_CANDIDATE, runDismissCandidate);
  host.registerHandler(AUTO_TAG_V2_ID, AUTO_TAG_V2_FIND_SIMILAR, runFindSimilar);
}
