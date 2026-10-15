import {
  extendedOperationsOf,
  immediateV2Result,
  isV2JobCancellation,
  V2OperationError,
  type ExtensionV2Host,
  type V2HandlerContext,
  type V2TagAttachment,
} from "yard-core";

import {
  AUTO_TAG_V2_CLAP_STATUS,
  AUTO_TAG_V2_COVERAGE_HISTORY,
  AUTO_TAG_V2_COVERAGE_SUMMARY,
  AUTO_TAG_V2_DISMISS_CANDIDATE,
  AUTO_TAG_V2_DOWNLOAD_MODEL,
  AUTO_TAG_V2_FIND_SIMILAR,
  AUTO_TAG_V2_ID,
  AUTO_TAG_V2_LIST_CANDIDATES,
  AUTO_TAG_V2_LIST_ORIGINS,
  AUTO_TAG_V2_LATEST_ARRIVALS,
  AUTO_TAG_V2_MERGE_TAG,
  AUTO_TAG_V2_PREVIEW,
  AUTO_TAG_V2_PROMOTE_CANDIDATE,
  AUTO_TAG_V2_RECORD_COVERAGE,
  AUTO_TAG_V2_REMOVE_BY_ORIGIN,
  AUTO_TAG_V2_RENAME_TAG,
  AUTO_TAG_V2_TAG_FILES,
  AUTO_TAG_V2_TAG_SEMANTIC,
} from "./definition";
import { clapPrompt, CLAP_MODEL_ID, rankLabels } from "./semantic";
import {
  MAX_CANDIDATE_EXAMPLES,
  MAX_CANDIDATE_STATE_BYTES,
  MAX_CANDIDATES,
  MAX_QUEUE_FILES,
  MAX_RETAINED_CANDIDATES,
  MAX_TAG_FILES,
  SEED_RULES,
  cleanCandidateWord,
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
  semanticTagged?: number;
  semanticAttached?: number;
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

function inputRecord(ctx: V2HandlerContext): Record<string, unknown> {
  return typeof ctx.invocation.input === "object" && ctx.invocation.input !== null
    ? (ctx.invocation.input as Record<string, unknown>)
    : {};
}

const CUSTOM_RULES_KEY = "deterministic-rules";

function readRules(ctx: V2HandlerContext): Array<{ tok: string; tags: string[] }> {
  const raw = ctx.operations.state.read(CUSTOM_RULES_KEY);
  const custom = Array.isArray(raw)
    ? raw.filter(
        (entry): entry is { tok: string; tags: string[] } =>
          typeof entry === "object" &&
          entry !== null &&
          typeof (entry as { tok?: unknown }).tok === "string" &&
          Array.isArray((entry as { tags?: unknown }).tags) &&
          (entry as { tags: unknown[] }).tags.every((tag) => typeof tag === "string"),
      )
    : [];
  const byToken = new Map(SEED_RULES.map((rule) => [rule.tok, { ...rule, tags: [...rule.tags] }]));
  for (const rule of custom) byToken.set(rule.tok, { tok: rule.tok, tags: [...rule.tags] });
  return [...byToken.values()];
}

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

export type AutoTagCandidateSource =
  | "filename_token"
  | "clap_suggestion"
  | "similar_audio_cluster";

export type AutoTagCandidateRecord = {
  id: string;
  label: string;
  source: AutoTagCandidateSource;
  confidence: number | null;
  exampleFileIds: string[];
  occurrenceCount: number;
  status: "pending" | "promoted" | "dismissed";
  createdAt: string;
  updatedAt: string;
};

const CANDIDATES_KEY = "candidates-v2";
const CANDIDATES_MINED_KEY = "candidates-mined";
const LATEST_ARRIVALS_KEY = "latest-arrivals";
const LAST_RUN_KEY = "latest-run";

export type LastRunSummary = {
  at: string;
  command: "tag-files" | "tag-semantic";
  tagged: number;
  attached: number;
  skipped: number;
  missing: number;
  failed: number;
};

function candidateId(source: AutoTagCandidateSource, label: string): string {
  return `${source}:${label}`;
}

/** What the most recent tagging run did, so the board can report counts jobs strip from HTTP. */
function recordLastRun(ctx: V2HandlerContext, summary: Omit<LastRunSummary, "at">): void {
  ctx.operations.state.write(LAST_RUN_KEY, { ...summary, at: new Date().toISOString() });
}

function readLastRun(ctx: V2HandlerContext): LastRunSummary | null {
  const raw = ctx.operations.state.read(LAST_RUN_KEY);
  if (typeof raw !== "object" || raw === null) return null;
  const value = raw as Record<string, unknown>;
  if (value.command !== "tag-files" && value.command !== "tag-semantic") return null;
  if (typeof value.at !== "string") return null;
  const count = (key: string): number =>
    typeof value[key] === "number" ? Math.max(0, Math.floor(value[key] as number)) : 0;
  return {
    at: value.at,
    command: value.command,
    tagged: count("tagged"),
    attached: count("attached"),
    skipped: count("skipped"),
    missing: count("missing"),
    failed: count("failed"),
  };
}

function isRecordValue(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCandidateRecord(entry: unknown): entry is AutoTagCandidateRecord {
  if (!isRecordValue(entry)) return false;
  const value = entry as Partial<AutoTagCandidateRecord>;
  return (
    typeof value.id === "string" &&
    typeof value.label === "string" &&
    (value.source === "filename_token" || value.source === "clap_suggestion" || value.source === "similar_audio_cluster") &&
    Array.isArray(value.exampleFileIds) &&
    typeof value.occurrenceCount === "number" &&
    (value.status === "pending" || value.status === "promoted" || value.status === "dismissed") &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string"
  );
}

/**
 * The persisted candidate queue (#288): the retained records plus how many
 * records earlier retention passes dropped. Stored as one value so a
 * read-modify-write keeps the records and their truncation count consistent.
 * Legacy state stored a bare array; it reads back with `dropped: 0`.
 */
type CandidatesState = { records: AutoTagCandidateRecord[]; dropped: number };

function normalizeCandidatesState(raw: unknown): CandidatesState {
  const list = Array.isArray(raw)
    ? raw
    : isRecordValue(raw) && Array.isArray(raw.records)
      ? raw.records
      : [];
  // Clone each record: the stored value comes back by reference, so mutating
  // it in place would edit the persisted envelope before the commit.
  const records = list.filter(isCandidateRecord).map((entry) => ({
    ...entry,
    exampleFileIds: [...entry.exampleFileIds],
  }));
  const dropped =
    isRecordValue(raw) && typeof raw.dropped === "number"
      ? Math.max(0, Math.floor(raw.dropped))
      : 0;
  return { records, dropped };
}

function readCandidates(ctx: V2HandlerContext): AutoTagCandidateRecord[] {
  return normalizeCandidatesState(ctx.operations.state.read(CANDIDATES_KEY)).records;
}

function serializeBytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value) ?? "").length;
}

/**
 * Highest-occurrence first, then `id` ascending. `id` is
 * `${source}:${label}`, so it is unique and the order is total — the same
 * order retention uses and the listing paginates over (#288).
 */
function compareCandidates(a: AutoTagCandidateRecord, b: AutoTagCandidateRecord): number {
  return b.occurrenceCount - a.occurrenceCount || a.id.localeCompare(b.id);
}

/** The keyset a candidate page resumes strictly after: its count and unique id. */
type CandidateCursor = { count: number; id: string };

function encodeCandidateCursor(entry: AutoTagCandidateRecord): string {
  return JSON.stringify({ c: entry.occurrenceCount, i: entry.id } satisfies {
    c: number;
    i: string;
  });
}

/** Decode a listing cursor; malformed cursors are rejected, never guessed. */
function decodeCandidateCursor(raw: unknown): CandidateCursor | null {
  if (raw === undefined || raw === null || raw === "") return null;
  if (typeof raw !== "string") {
    throw new V2OperationError("input-invalid", "Candidate cursor must be a string.");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new V2OperationError(
      "input-invalid",
      "Candidate cursor is not readable; page again from the start.",
    );
  }
  if (
    !isRecordValue(parsed) ||
    typeof parsed.c !== "number" ||
    !Number.isFinite(parsed.c) ||
    typeof parsed.i !== "string"
  ) {
    throw new V2OperationError(
      "input-invalid",
      "Candidate cursor is not readable; page again from the start.",
    );
  }
  return { count: parsed.c, id: parsed.i };
}

/** True when `entry` sorts strictly after `cursor` in the listing order. */
function isAfterCursor(entry: AutoTagCandidateRecord, cursor: CandidateCursor): boolean {
  return (
    entry.occurrenceCount < cursor.count ||
    (entry.occurrenceCount === cursor.count && entry.id > cursor.id)
  );
}

/**
 * Cap the queue explicitly and deterministically: at most
 * `MAX_RETAINED_CANDIDATES` records, then byte-pruned from the lowest-priority
 * end until the serialized queue fits `MAX_CANDIDATE_STATE_BYTES`. Everything
 * dropped is counted, so the listing can report truncation instead of losing
 * candidates silently.
 */
function retainCandidates(state: CandidatesState): CandidatesState {
  const ordered = [...state.records].sort(compareCandidates);
  const kept = ordered.slice(0, MAX_RETAINED_CANDIDATES);
  let dropped = state.dropped + (ordered.length - kept.length);
  while (kept.length > 1 && serializeBytes(kept) > MAX_CANDIDATE_STATE_BYTES) {
    kept.pop();
    dropped += 1;
  }
  return { records: kept, dropped };
}

/** Fold suggestions into the queue; occurrences accumulate, examples stay capped. */
function mergeCandidatesState(
  state: CandidatesState,
  suggestions: Array<{
    label: string;
    source: AutoTagCandidateSource;
    confidence?: number | null;
    fileId: string;
  }>,
): CandidatesState {
  if (suggestions.length === 0) return state;
  const now = new Date().toISOString();
  const records = state.records.map((entry) => ({ ...entry, exampleFileIds: [...entry.exampleFileIds] }));
  const byId = new Map(records.map((entry) => [entry.id, entry]));
  for (const suggestion of suggestions) {
    const id = candidateId(suggestion.source, suggestion.label);
    const existing = byId.get(id);
    if (existing) {
      if (existing.status !== "pending") continue;
      existing.occurrenceCount += 1;
      if (!existing.exampleFileIds.includes(suggestion.fileId) && existing.exampleFileIds.length < MAX_CANDIDATE_EXAMPLES) {
        existing.exampleFileIds.push(suggestion.fileId);
      }
      existing.confidence = Math.max(existing.confidence ?? 0, suggestion.confidence ?? 0) || null;
      existing.updatedAt = now;
      continue;
    }
    const record: AutoTagCandidateRecord = {
      id,
      label: suggestion.label,
      source: suggestion.source,
      confidence: suggestion.confidence ?? null,
      exampleFileIds: [suggestion.fileId],
      occurrenceCount: 1,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    };
    records.push(record);
    byId.set(id, record);
  }
  return { ...state, records };
}

/** Synchronous merge used by the one-time mining walk, where no await may interleave. */
function mergeCandidates(ctx: V2HandlerContext, suggestions: Parameters<typeof mergeCandidatesState>[1]): void {
  const next = retainCandidates(
    mergeCandidatesState(normalizeCandidatesState(ctx.operations.state.read(CANDIDATES_KEY)), suggestions),
  );
  ctx.operations.state.write(CANDIDATES_KEY, next);
}

/**
 * Atomic merge used by tag jobs: `update` serializes per store, so concurrent
 * jobs sharing the runtime fold their suggestions into one queue instead of
 * each clobbering the other with a stale snapshot.
 */
async function mergeCandidatesAtomic(
  ctx: V2HandlerContext,
  suggestions: Parameters<typeof mergeCandidatesState>[1],
): Promise<void> {
  if (suggestions.length === 0) return;
  await ctx.operations.state.update(CANDIDATES_KEY, (current) =>
    retainCandidates(mergeCandidatesState(normalizeCandidatesState(current), suggestions)),
  );
}

function ensureFilenameCandidates(ctx: V2HandlerContext): void {
  if (readCandidates(ctx).length > 0) return;
  if (ctx.operations.state.read(CANDIDATES_MINED_KEY) === true) return;
  const rules = readRules(ctx);
  const suggestions: Array<{ label: string; source: "filename_token"; fileId: string }> = [];
  let cursor: string | null = null;
  let walked = 0;
  do {
    const page = ctx.operations.library.listPage(cursor, 500);
    const files = page.files
      .filter((file) => file.removedAt === null)
      .slice(0, MAX_QUEUE_FILES - walked);
    for (const file of files) {
      for (const label of unmatchedTokens(file.filename || `${file.id}.bin`, rules)) {
        suggestions.push({ label, source: "filename_token", fileId: file.id });
      }
    }
    walked += files.length;
    cursor = walked >= MAX_QUEUE_FILES ? null : page.nextCursor;
  } while (cursor);
  mergeCandidates(ctx, suggestions);
  ctx.operations.state.write(CANDIDATES_MINED_KEY, true);
}

export function runPreview(ctx: V2HandlerContext) {
  const { live, missing } = resolveLiveFiles(ctx, readFileIds(ctx));
  const rules = readRules(ctx);
  const planned: string[] = [];
  const untaggedFileIds: string[] = [];
  const candidateSet = new Set<string>();
  for (const file of live) {
    const tags = tagsForFilename(file.filename, rules);
    if (tags.length === 0) {
      untaggedFileIds.push(file.fileId);
    } else {
      planned.push(`${file.filename} -> ${tags.join(", ")}`);
    }
    for (const word of unmatchedTokens(file.filename, rules)) {
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
  const rules = readRules(ctx);
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

  // #258: one transaction per file chunk instead of one commit per row. A
  // failed chunk is attributed to its files and the job keeps going.
  const TAG_BATCH_FILES = 100;
  let pending: Array<{ filename: string; fileId: string; names: string[] }> = [];
  const flushTagBatch = () => {
    if (pending.length === 0) return;
    const batch = pending;
    pending = [];
    const entries = batch.flatMap((file) =>
      file.names.map((name) => ({
        fileId: file.fileId,
        tagId: tagIdFor(name),
        origin: "deterministic" as const,
      })),
    );
    try {
      if (tags.attachMany) {
        tags.attachMany(entries);
      } else {
        for (const entry of entries) {
          tags.attach(entry.fileId, entry.tagId, entry.origin);
        }
      }
      attached += entries.length;
      tagged += batch.length;
    } catch (error) {
      if (isV2JobCancellation(error)) throw error;
      for (const file of batch) {
        failedFiles.push(file.filename);
        failedReasons.push(
          `"${file.filename}": ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    for (let index = 0; index < batch.length; index += 1) {
      done += 1;
      ctx.operations.jobs.reportProgress(done, live.length);
    }
  };

  for (const file of live) {
    try {
      ctx.operations.jobs.throwIfCancelled();
    } catch (error) {
      if (isV2JobCancellation(error)) throw error;
      throw error;
    }
    const names = tagsForFilename(file.filename, rules);
    if (names.length === 0) {
      skipped.push(file.filename);
      done += 1;
      ctx.operations.jobs.reportProgress(done, live.length);
      continue;
    }
    pending.push({ filename: file.filename, fileId: file.fileId, names });
    if (pending.length >= TAG_BATCH_FILES) flushTagBatch();
  }
  flushTagBatch();

  const filenameSuggestions = live.flatMap((file) =>
    unmatchedTokens(file.filename, rules).map((label) => ({
      label,
      source: "filename_token" as const,
      fileId: file.fileId,
    })),
  );
  await mergeCandidatesAtomic(ctx, filenameSuggestions);

  let semanticTagged = 0;
  let semanticAttached = 0;
  if (ctx.runMode === "job") {
    const { analysis } = extendedOperationsOf(ctx);
    const model = analysis.modelStatus(CLAP_MODEL_ID);
    if (model.state === "ready" && model.backendAvailable) {
      const semantic = await runSemanticBatch(ctx, live, missing);
      semanticTagged = semantic.tagged;
      semanticAttached = semantic.attached;
    }
    recordArrivalBatch(ctx, live, rules);
  }

  const result = {
    tagged,
    attached,
    skipped,
    missing,
    failedFiles,
    failedReasons,
    semanticTagged,
    semanticAttached,
  } satisfies AutoTagV2TagFilesResult;
  recordLastRun(ctx, {
    command: "tag-files",
    tagged,
    attached,
    skipped: skipped.length,
    missing: missing.length,
    failed: failedFiles.length,
  });
  await recordCoverageAtBoundary(ctx, inputRecord(ctx).scanStartedAt as string | undefined);
  return immediateV2Result(result);
}

export type AutoTagV2ListCandidatesResult = {
  words: string[];
  lines: string[];
  entries: string[];
  /** True when retention dropped candidates, so the queue is not the full set discovered. */
  truncated: boolean;
  /** Total pending candidates in the retained queue (not just this page). */
  total: number;
  /** Cursor for the next page; empty when this page is the last. */
  nextCursor: string;
  /** Records actually stored in the retained queue. */
  retained: number;
  /** The retained-record bound the queue is capped to. */
  retainedLimit: number;
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

function readCandidateWord(ctx: V2HandlerContext): string {
  const raw = inputRecord(ctx);
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
  const raw = inputRecord(ctx);
  const limit = Math.max(1, Math.min(MAX_CANDIDATES, typeof raw.limit === "number" ? Math.floor(raw.limit) : MAX_CANDIDATES));
  const after = decodeCandidateCursor(raw.cursor);
  const { tags } = extendedOperationsOf(ctx);
  ensureFilenameCandidates(ctx);
  const state = normalizeCandidatesState(ctx.operations.state.read(CANDIDATES_KEY));
  const handled = new Set(tags.list().map((tag) => tag.name.toLowerCase()));
  const all = state.records
    .filter((entry) => entry.status === "pending" && !handled.has(entry.label))
    .sort(compareCandidates);
  // Keyset page: resume strictly after the cursor's (count, id), so a page
  // boundary never shifts the way an offset would when the queue changes.
  const eligible = after ? all.filter((entry) => isAfterCursor(entry, after)) : all;
  const entries = eligible.slice(0, limit);
  const last = entries[entries.length - 1];
  return immediateV2Result({
    words: entries.map((entry) => entry.label),
    lines: entries.map((entry) =>
      `${entry.label} - ${entry.occurrenceCount} occurrence${entry.occurrenceCount === 1 ? "" : "s"} from ${entry.source.replaceAll("_", " ")}`,
    ),
    entries: entries.map((entry) => JSON.stringify(entry)),
    truncated: state.dropped > 0,
    total: all.length,
    nextCursor: eligible.length > entries.length && last ? encodeCandidateCursor(last) : "",
    retained: state.records.length,
    retainedLimit: MAX_RETAINED_CANDIDATES,
    totalFiles: new Set(entries.flatMap((entry) => entry.exampleFileIds)).size,
  } satisfies AutoTagV2ListCandidatesResult);
}

export async function runPromoteCandidate(ctx: V2HandlerContext) {
  const word = readCandidateWord(ctx);
  const raw = inputRecord(ctx);
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

  const allTags = tags.list();
  const known = new Map(allTags.map((tag) => [tag.name.toLowerCase(), tag.id]));
  let tagId = known.get(word) ?? tags.resolveAlias(word) ?? undefined;
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

  await ctx.operations.state.update(CANDIDATES_KEY, (current) => {
    const state = normalizeCandidatesState(current);
    const now = new Date().toISOString();
    return retainCandidates({
      ...state,
      records: state.records.map((candidate) =>
        candidate.label === word && candidate.status === "pending"
          ? { ...candidate, status: "promoted", updatedAt: now }
          : candidate,
      ),
    });
  });

  if (raw.useForFutureFilenames === true) {
    const custom = readRules(ctx).filter((rule) => !SEED_RULES.some((seed) => seed.tok === rule.tok));
    if (!custom.some((rule) => rule.tok === word)) {
      custom.push({ tok: word, tags: [allTags.find((tag) => tag.id === tagId)?.name ?? word] });
      ctx.operations.state.write(CUSTOM_RULES_KEY, custom);
    }
  }

  return immediateV2Result({
    tag: word,
    tagId,
    attached,
    missing,
  } satisfies AutoTagV2PromoteCandidateResult);
}

export async function runDismissCandidate(ctx: V2HandlerContext) {
  const word = readCandidateWord(ctx);
  ensureFilenameCandidates(ctx);
  const now = new Date().toISOString();
  let dismissedCount = 0;
  await ctx.operations.state.update(CANDIDATES_KEY, (current) => {
    const state = normalizeCandidatesState(current);
    const records = state.records.map((candidate) => {
      if (candidate.label === word && candidate.status === "pending") {
        dismissedCount += 1;
        return { ...candidate, status: "dismissed" as const, updatedAt: now };
      }
      return candidate;
    });
    return retainCandidates({ ...state, records });
  });
  return immediateV2Result({
    word,
    dismissedCount,
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
  if (!embeddings.get(target.id, CLAP_MODEL_ID)) {
    return immediateV2Result({
      targetFileId: target.id,
      targetFilename: target.filename || `${target.id}.bin`,
      similarFileIds: [],
      similarFilenames: [],
      matches: [],
      unavailable: true,
      reason: "Similarity unavailable until audio analysis completes.",
    } satisfies AutoTagV2FindSimilarResult);
  }
  const ranked = embeddings.findSimilar(target.id, { model: CLAP_MODEL_ID, topN });
  const similarFileIds: string[] = [];
  const similarFilenames: string[] = [];
  const matches: string[] = [];
  for (const entry of ranked) {
    const record = ctx.operations.library.getFile(entry.fileId);
    if (!record) continue;
    similarFileIds.push(record.id);
    similarFilenames.push(record.filename || `${record.id}.bin`);
    matches.push(JSON.stringify({ fileId: record.id, filename: record.filename || `${record.id}.bin`, score: entry.score }));
  }
  return immediateV2Result({
    targetFileId: target.id,
    targetFilename: target.filename || `${target.id}.bin`,
    similarFileIds,
    similarFilenames,
    matches,
    unavailable: false,
  } satisfies AutoTagV2FindSimilarResult);
}

export function runClapStatus(ctx: V2HandlerContext) {
  const { analysis } = extendedOperationsOf(ctx);
  const status = analysis.modelStatus(CLAP_MODEL_ID);
  return immediateV2Result({
    modelId: status.modelId,
    state: status.state,
    downloadedBytes: status.downloadedBytes,
    totalBytes: status.totalBytes,
    backendAvailable: status.backendAvailable,
  } satisfies AutoTagV2ClapStatusResult);
}

export async function runDownloadModel(ctx: V2HandlerContext) {
  const raw =
    typeof ctx.invocation.input === "object" && ctx.invocation.input !== null
      ? (ctx.invocation.input as Record<string, unknown>)
      : {};
  if (raw.confirm !== true) {
    const { analysis } = extendedOperationsOf(ctx);
    const status = analysis.modelStatus(CLAP_MODEL_ID);
    throw new V2OperationError(
      "input-invalid",
      `Downloading the tagging model fetches about ${Math.round(status.totalBytes / 1_000_000)} MB. Pass confirm true to proceed.`,
    );
  }
  const { analysis } = extendedOperationsOf(ctx);
  const jobs = ctx.operations.jobs;
  const { bytes } = await analysis.downloadModel(CLAP_MODEL_ID, {
    onProgress: (downloadedBytes, totalBytes) => {
      jobs.reportProgress(downloadedBytes, Math.max(totalBytes, 1));
    },
    throwIfCancelled: () => {
      jobs.throwIfCancelled();
    },
  });
  return immediateV2Result({
    modelId: CLAP_MODEL_ID,
    bytes,
  } satisfies AutoTagV2DownloadModelResult);
}

async function runSemanticBatch(
  ctx: V2HandlerContext,
  live: LiveTagFile[],
  missing: string[],
): Promise<AutoTagV2TagSemanticResult> {
  const { tags, embeddings, analysis } = extendedOperationsOf(ctx);
  if (!analysis.backendAvailable()) {
    throw new V2OperationError(
      "input-invalid",
      "CLAP inference is not installed, so there is nothing to tag with. See the auto-tag-v2 README for the install step.",
    );
  }
  const status = analysis.modelStatus(CLAP_MODEL_ID);
  if (status.state !== "ready") {
    throw new V2OperationError(
      "input-invalid",
      "The CLAP model is unavailable. Download it from Auto Tag after confirming the model size.",
    );
  }
  const vocabulary = tags.list();
  if (vocabulary.length === 0) {
    throw new V2OperationError(
      "input-invalid",
      "There are no approved tags to classify against; promote a candidate first.",
    );
  }
  const prompts = vocabulary.map((tag) => clapPrompt(tag.name));
  const textVecs = await analysis.embedTexts(prompts);
  const known = new Map(vocabulary.map((tag) => [tag.name, tag.id]));
  const pendingCandidates = readCandidates(ctx).filter((entry) => entry.status === "pending").slice(0, 50);
  const candidateVecs = pendingCandidates.length > 0
    ? await analysis.embedTexts(pendingCandidates.map((entry) => clapPrompt(entry.label)))
    : [];

  const skipped: string[] = [];
  const failedFiles: string[] = [];
  const failedReasons: string[] = [];
  let tagged = 0;
  let attached = 0;
  let done = 0;
  const staged: Array<{
    file: LiveTagFile;
    vec: number[];
    tags: Array<{ tagId: string; confidence: number }>;
    candidate?: { label: string; confidence: number };
  }> = [];

  for (const file of live) {
    try {
      ctx.operations.jobs.throwIfCancelled();
    } catch (error) {
      if (isV2JobCancellation(error)) throw error;
      throw error;
    }
    try {
      const audio = await analysis.embedAudio(file.fileId);
      const ranked = rankLabels(audio.vec, vocabulary.map((tag) => tag.name), textVecs);
      const stagedTags = ranked.flatMap((entry) => {
        const tagId = known.get(entry.label);
        return tagId ? [{ tagId, confidence: entry.confidence }] : [];
      });
      const candidate = pendingCandidates.length > 0
        ? rankLabels(audio.vec, pendingCandidates.map((entry) => entry.label), candidateVecs)[0]
        : undefined;
      staged.push({
        file,
        vec: audio.vec,
        tags: stagedTags,
        ...(candidate ? { candidate: { label: candidate.label, confidence: candidate.confidence } } : {}),
      });
    } catch (error) {
      if (isV2JobCancellation(error)) throw error;
      failedFiles.push(file.filename);
      failedReasons.push(`"${file.filename}": ${error instanceof Error ? error.message : String(error)}`);
    }
    done += 1;
    ctx.operations.jobs.reportProgress(done, live.length);
  }

  // Cancellation is all-or-nothing for this submitted batch. Inference is
  // staged in memory, then one synchronous commit section applies it with no
  // await or cancellation yield between the first and last write.
  ctx.operations.jobs.throwIfCancelled();
  for (const entry of staged) {
    embeddings.store(entry.file.fileId, CLAP_MODEL_ID, entry.vec);
    if (entry.tags.length === 0) skipped.push(entry.file.filename);
    else tagged += 1;
    for (const attachment of entry.tags) {
      tags.attach(entry.file.fileId, attachment.tagId, "semantic_ai", attachment.confidence);
      attached += 1;
    }
  }

  await mergeCandidatesAtomic(
    ctx,
    staged.flatMap((entry) =>
      entry.candidate
        ? [{
            label: entry.candidate.label,
            source: "clap_suggestion" as const,
            confidence: entry.candidate.confidence,
            fileId: entry.file.fileId,
          }]
        : [],
    ),
  );
  const clusters = new Map<string, Array<{ fileId: string; confidence: number }>>();
  for (const entry of staged) {
    if (!entry.candidate) continue;
    const group = clusters.get(entry.candidate.label) ?? [];
    group.push({ fileId: entry.file.fileId, confidence: entry.candidate.confidence });
    clusters.set(entry.candidate.label, group);
  }
  await mergeCandidatesAtomic(
    ctx,
    [...clusters.entries()].flatMap(([label, group]) =>
      group.length < 2
        ? []
        : group.map((entry) => ({
            label,
            source: "similar_audio_cluster" as const,
            confidence: group.reduce((sum, item) => sum + item.confidence, 0) / group.length,
            fileId: entry.fileId,
          })),
    ),
  );

  return {
    tagged,
    attached,
    skipped,
    missing,
    failedFiles,
    failedReasons,
  };
}

export async function runTagSemantic(ctx: V2HandlerContext) {
  const { live, missing } = resolveLiveFiles(ctx, readFileIds(ctx));
  const result = await runSemanticBatch(ctx, live, missing);
  if (ctx.runMode === "job" && typeof inputRecord(ctx).batchId === "string") {
    recordArrivalBatch(ctx, live, readRules(ctx));
  }
  recordLastRun(ctx, {
    command: "tag-semantic",
    tagged: result.tagged,
    attached: result.attached,
    skipped: result.skipped.length,
    missing: result.missing.length,
    failed: result.failedFiles.length,
  });
  await recordCoverageAtBoundary(ctx, inputRecord(ctx).scanStartedAt as string | undefined);
  return immediateV2Result(result satisfies AutoTagV2TagSemanticResult);
}

export type AutoTagV2FindSimilarResult = {
  targetFileId: string;
  targetFilename: string;
  similarFileIds: string[];
  similarFilenames: string[];
  matches: string[];
  unavailable: boolean;
  reason?: string;
};

export type AutoTagV2ClapStatusResult = {
  modelId: string;
  state: "ready" | "not-downloaded" | "downloading";
  downloadedBytes: number;
  totalBytes: number;
  backendAvailable: boolean;
};

export type AutoTagV2DownloadModelResult = {
  modelId: string;
  bytes: number;
};

export type AutoTagV2TagSemanticResult = {
  tagged: number;
  attached: number;
  skipped: string[];
  missing: string[];
  failedFiles: string[];
  failedReasons: string[];
};

export type AutoTagV2CoverageHistoryResult = {
  entries: string[];
};

export type AutoTagV2RecordCoverageResult = {
  recorded: boolean;
  entriesCount: number;
};

export type CoverageSnapshot = {
  at: string;
  tagged: number;
  total: number;
  tags: Record<string, number>;
  invocationId?: string;
  scanId?: string;
  /** Tag entries dropped from `tags` because the snapshot's tag cap was reached. */
  omittedTags?: number;
};

/** Snapshots live in extension state, oldest first, bounded. */
export const COVERAGE_HISTORY_KEY = "coverage-history";
export const MAX_COVERAGE_SNAPSHOTS = 30;
/** Tag entries one snapshot keeps; the rest are counted in `omittedTags`. */
export const MAX_COVERAGE_TAGS = 200;
/**
 * Serialized byte ceiling for the coverage history. A large Library's tag
 * vocabulary can be wide, so the count cap alone is not enough to keep the
 * shared per-extension state inside its budget (#288).
 */
export const MAX_COVERAGE_STATE_BYTES = 12 * 1024;

function normalizeSnapshots(raw: unknown): CoverageSnapshot[] {
  if (!Array.isArray(raw)) return [];
  const out: CoverageSnapshot[] = [];
  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) continue;
    const record = entry as Record<string, unknown>;
    if (typeof record.at !== "string") continue;
    const tags: Record<string, number> = {};
    if (record.tags && typeof record.tags === "object") {
      for (const [name, count] of Object.entries(record.tags as Record<string, unknown>)) {
        if (typeof count === "number" && Number.isInteger(count) && count >= 0) {
          tags[name] = count;
        }
      }
    }
    out.push({
      at: record.at,
      tagged: typeof record.tagged === "number" ? Math.max(0, Math.floor(record.tagged)) : 0,
      total: typeof record.total === "number" ? Math.max(0, Math.floor(record.total)) : 0,
      tags,
      ...(typeof record.invocationId === "string" ? { invocationId: record.invocationId } : {}),
      ...(typeof record.scanId === "string" ? { scanId: record.scanId } : {}),
      ...(typeof record.omittedTags === "number"
        ? { omittedTags: Math.max(0, Math.floor(record.omittedTags)) }
        : {}),
    });
  }
  return out;
}

/** Keep the widest-counting tags; the rest are counted, not stored. */
function capSnapshotTags(snapshot: CoverageSnapshot): CoverageSnapshot {
  const entries = Object.entries(snapshot.tags);
  if (entries.length <= MAX_COVERAGE_TAGS) return snapshot;
  const kept = entries
    .sort(([aName, aCount], [bName, bCount]) => bCount - aCount || aName.localeCompare(bName))
    .slice(0, MAX_COVERAGE_TAGS);
  return {
    ...snapshot,
    tags: Object.fromEntries(kept),
    omittedTags: (snapshot.omittedTags ?? 0) + (entries.length - kept.length),
  };
}

/**
 * Cap the history the way candidates are capped: the newest
 * `MAX_COVERAGE_SNAPSHOTS`, each with at most `MAX_COVERAGE_TAGS` entries, then
 * byte-pruned from the oldest end until it fits `MAX_COVERAGE_STATE_BYTES`.
 */
function retainSnapshots(snapshots: CoverageSnapshot[]): CoverageSnapshot[] {
  const kept = snapshots.map(capSnapshotTags);
  while (kept.length > 1 && serializeBytes(kept) > MAX_COVERAGE_STATE_BYTES) kept.shift();
  while (kept.length > MAX_COVERAGE_SNAPSHOTS) kept.shift();
  return kept;
}

function readSnapshots(ctx: V2HandlerContext): CoverageSnapshot[] {
  return normalizeSnapshots(ctx.operations.state.read(COVERAGE_HISTORY_KEY));
}

/**
 * Append a snapshot through the atomic read-modify-write, then prune the
 * history to its count and byte caps. Serialized per store, so concurrent jobs
 * append without losing each other's entries (#288).
 */
async function appendSnapshot(
  ctx: V2HandlerContext,
  snapshot: CoverageSnapshot,
): Promise<CoverageSnapshot[]> {
  let kept: CoverageSnapshot[] = [];
  await ctx.operations.state.update(COVERAGE_HISTORY_KEY, (current) => {
    const snapshots = normalizeSnapshots(current);
    snapshots.push(snapshot);
    kept = retainSnapshots(snapshots);
    return kept;
  });
  return kept;
}

export function runCoverageHistory(ctx: V2HandlerContext) {
  return immediateV2Result({
    entries: readSnapshots(ctx).map((entry) => JSON.stringify(entry)),
  } satisfies AutoTagV2CoverageHistoryResult);
}

/** Parse the caller's `name:count` tag deltas into a bounded count map. */
function parseTagDeltas(raw: unknown): Record<string, number> {
  const tags: Record<string, number> = {};
  for (const entry of Array.isArray(raw) ? raw : []) {
    if (typeof entry !== "string") continue;
    const match = /^(.+):(\d+)$/.exec(entry.trim());
    if (!match) continue;
    const name = match[1]!.trim();
    const count = Number.parseInt(match[2]!, 10);
    if (!name || !Number.isFinite(count) || count < 0) continue;
    tags[name] = (tags[name] ?? 0) + count;
  }
  return tags;
}

function countValue(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

/**
 * Record the caller's bounded delta — `tagged`, `total` and per-tag counts —
 * instead of re-aggregating the whole Library (#288). Callers that already
 * measured coverage pay no extra scan; the contract's own inputs are honoured.
 */
export async function runRecordCoverage(ctx: V2HandlerContext) {
  const input = inputRecord(ctx);
  const snapshots = await appendSnapshot(ctx, {
    at: new Date().toISOString(),
    tagged: countValue(input.tagged),
    total: countValue(input.total),
    tags: parseTagDeltas(input.tags),
    invocationId: ctx.invocation.invocationId,
  });
  return immediateV2Result({
    recorded: true,
    entriesCount: snapshots.length,
  } satisfies AutoTagV2RecordCoverageResult);
}

type AttachmentView = {
  id: string;
  name: string;
  origin: "manual" | "deterministic" | "semantic_ai";
  confidence: number | null;
};

type CoverageMemberTag = {
  id: string;
  name: string;
  origin: "manual" | "deterministic" | "semantic_ai";
  confidence: number | null;
};

type CoverageMember = {
  fileId: string;
  filename: string;
  tags: CoverageMemberTag[];
};

type LibraryScan = {
  total: number;
  tagged: number;
  tags: Record<string, number>;
  allTags: string[];
  origins: Record<"manual" | "deterministic" | "semantic_ai", number>;
  members: CoverageMember[];
  matched: number;
};

type LibraryScanFilter = {
  tag?: string;
  origin?: "manual" | "deterministic" | "semantic_ai";
};

/**
 * Coverage aggregate plus, when a filter and page are supplied, a page of
 * matching members and the full match count (#257). A host that exposes the
 * SQL coverage/member ports answers from grouped queries and one bounded
 * member read; otherwise the single active-library pass below produces the
 * same values so fixture hosts and tests behave identically.
 */
function aggregateLibrary(
  ctx: V2HandlerContext,
  filter?: LibraryScanFilter,
  page?: { skip: number; limit: number },
): LibraryScan {
  const { tags } = extendedOperationsOf(ctx);
  if (tags.coverage && (!filter || (page && tags.memberPage))) {
    const coverage = tags.coverage();
    if (!filter || !page || !tags.memberPage) {
      return { ...coverage, members: [], matched: 0 };
    }
    const result = tags.memberPage({
      ...(filter.tag ? { tag: filter.tag } : {}),
      ...(filter.origin ? { origin: filter.origin } : {}),
      skip: page.skip,
      limit: page.limit,
    });
    return {
      ...coverage,
      members: result.members.map((member) => ({
        fileId: member.fileId,
        filename: member.filename,
        tags: member.tags.map((tag) => ({
          id: tag.id,
          name: tag.name,
          origin: tag.origin,
          confidence: tag.confidence,
        })),
      })),
      matched: result.matched,
    };
  }

  const tagCounts: Record<string, number> = {};
  const origins = { manual: 0, deterministic: 0, semantic_ai: 0 };
  const members: CoverageMember[] = [];
  const skip = page?.skip ?? 0;
  const limit = page?.limit ?? 0;
  let matched = 0;
  let total = 0;
  let tagged = 0;
  let cursor: string | null = null;
  do {
    const batch = ctx.operations.library.listPage(cursor, 500);
    const files = batch.files.filter((file) => file.removedAt === null);
    const attachments = tags.attachmentsForFiles(files.map((file) => file.id));
    const byFile = new Map<string, V2TagAttachment[]>();
    for (const attachment of attachments) {
      const list = byFile.get(attachment.fileId) ?? [];
      list.push(attachment);
      byFile.set(attachment.fileId, list);
    }
    for (const file of files) {
      total += 1;
      const fileAttachments = byFile.get(file.id) ?? [];
      if (fileAttachments.length > 0) tagged += 1;
      const seenOrigins = new Set<string>();
      for (const attachment of fileAttachments) {
        tagCounts[attachment.tagName] = (tagCounts[attachment.tagName] ?? 0) + 1;
        seenOrigins.add(attachment.origin);
      }
      for (const origin of seenOrigins) origins[origin as keyof typeof origins] += 1;
      if (!filter) continue;
      const matches =
        (!filter.tag ||
          fileAttachments.some(
            (attachment) => attachment.tagName.toLowerCase() === filter.tag!.toLowerCase(),
          )) &&
        (!filter.origin ||
          fileAttachments.some((attachment) => attachment.origin === filter.origin));
      if (!matches) continue;
      if (matched >= skip && members.length < limit) {
        members.push({
          fileId: file.id,
          filename: file.filename,
          tags: fileAttachments.map((attachment) => ({
            id: attachment.tagId,
            name: attachment.tagName,
            origin: attachment.origin,
            confidence: attachment.confidence,
          })),
        });
      }
      matched += 1;
    }
    cursor = batch.nextCursor;
  } while (cursor);
  return {
    total,
    tagged,
    tags: tagCounts,
    allTags: tags.list().map((tag) => tag.name),
    origins,
    members,
    matched,
  };
}

/**
 * Record coverage once per completed scan (#288). When the scan boundary is
 * known and already present, skip the aggregation entirely so a scan split
 * into many 500-file jobs does not re-walk the Library or duplicate its
 * snapshot. The append itself is atomic, so two racing jobs still land one
 * snapshot per scan.
 */
async function recordCoverageAtBoundary(ctx: V2HandlerContext, scanId?: string): Promise<void> {
  if (scanId && readSnapshots(ctx).some((entry) => entry.scanId === scanId)) return;
  const aggregate = aggregateLibrary(ctx);
  await appendSnapshot(ctx, {
    at: new Date().toISOString(),
    tagged: aggregate.tagged,
    total: aggregate.total,
    tags: aggregate.tags,
    invocationId: ctx.invocation.invocationId,
    ...(scanId ? { scanId } : {}),
  });
}

/** Files one arrival batch keeps, and the serialized byte ceiling for them. */
export const MAX_ARRIVAL_FILES = 100;
export const MAX_ARRIVAL_STATE_BYTES = 12 * 1024;

type ArrivalBatch = {
  batchId: string;
  scanStartedAt?: string;
  invocationId: string;
  completedAt: string;
  files: Array<{
    id: string;
    filename: string;
    tagged: boolean;
    firedRules: Array<{ token: string; tags: string[] }>;
    tags: AttachmentView[];
  }>;
  /** Files the batch actually processed; may exceed the retained `files`. */
  totalFiles: number;
  /** True when the retained file list was capped by count or bytes. */
  truncated: boolean;
};

function latestArrival(ctx: V2HandlerContext): ArrivalBatch | null {
  const value = ctx.operations.state.read(LATEST_ARRIVALS_KEY);
  if (!isRecordValue(value) || !Array.isArray(value.files)) return null;
  const batch = value as unknown as ArrivalBatch;
  return {
    ...batch,
    totalFiles: typeof value.totalFiles === "number" ? value.totalFiles : batch.files.length,
    truncated: value.truncated === true,
  };
}

function recordArrivalBatch(
  ctx: V2HandlerContext,
  files: LiveTagFile[],
  rules: Array<{ tok: string; tags: string[] }>,
): void {
  const { tags } = extendedOperationsOf(ctx);
  const byFile = new Map<string, AttachmentView[]>();
  for (const attachment of tags.attachmentsForFiles(files.map((file) => file.fileId))) {
    const list = byFile.get(attachment.fileId) ?? [];
    list.push({
      id: attachment.tagId,
      name: attachment.tagName,
      origin: attachment.origin,
      confidence: attachment.confidence,
    });
    byFile.set(attachment.fileId, list);
  }
  const mapped = files.map((file) => {
    const attachments = byFile.get(file.fileId) ?? [];
    return {
      id: file.fileId,
      filename: file.filename,
      tagged: attachments.length > 0,
      firedRules: rules
        .filter((rule) => filenameMatchesToken(file.filename, rule.tok))
        .map((rule) => ({ token: rule.tok, tags: [...rule.tags] })),
      tags: attachments,
    };
  });
  // Cap the retained arrival list so a large scan cannot push the shared
  // extension state past its byte budget; report the cap instead of hiding it.
  const retained = mapped.slice(0, MAX_ARRIVAL_FILES);
  let truncated = mapped.length > retained.length;
  while (retained.length > 1 && serializeBytes(retained) > MAX_ARRIVAL_STATE_BYTES) {
    retained.pop();
    truncated = true;
  }
  const input = inputRecord(ctx);
  ctx.operations.state.write(LATEST_ARRIVALS_KEY, {
    batchId: typeof input.batchId === "string" ? input.batchId : ctx.invocation.invocationId,
    ...(typeof input.scanStartedAt === "string" ? { scanStartedAt: input.scanStartedAt } : {}),
    invocationId: ctx.invocation.invocationId,
    completedAt: new Date().toISOString(),
    totalFiles: mapped.length,
    truncated,
    files: retained,
  } satisfies ArrivalBatch);
}

export function runCoverageSummary(ctx: V2HandlerContext) {
  const input = inputRecord(ctx);
  const selectedTag = typeof input.tag === "string" ? input.tag.trim().toLowerCase() : "";
  const skip = typeof input.cursor === "string" ? Math.max(0, Number.parseInt(input.cursor, 10) || 0) : 0;
  const limit = Math.max(1, Math.min(100, typeof input.limit === "number" ? Math.floor(input.limit) : 50));
  const scan = aggregateLibrary(
    ctx,
    selectedTag ? { tag: selectedTag } : undefined,
    { skip, limit },
  );
  const configuredRules = readRules(ctx);
  const members = scan.members.map((member) =>
    JSON.stringify({
      id: member.fileId,
      filename: member.filename,
      tags: member.tags,
    }),
  );
  return immediateV2Result({
    summary: JSON.stringify({
      total: scan.total,
      tagged: scan.tagged,
      tags: scan.tags,
      allTags: scan.allTags,
      origins: scan.origins,
      members,
      nextCursor: skip + members.length < scan.matched ? String(skip + members.length) : "",
      configuredRules,
    }),
  });
}

export function runListOrigins(ctx: V2HandlerContext) {
  const input = inputRecord(ctx);
  const origin = input.origin === "manual" || input.origin === "deterministic" || input.origin === "semantic_ai"
    ? input.origin
    : "all";
  const skip = typeof input.cursor === "string" ? Math.max(0, Number.parseInt(input.cursor, 10) || 0) : 0;
  const limit = Math.max(1, Math.min(100, typeof input.limit === "number" ? Math.floor(input.limit) : 50));
  const arrivals = latestArrival(ctx);
  const firedByFile = new Map(arrivals?.files.map((file) => [file.id, file.firedRules]) ?? []);
  const scan = aggregateLibrary(
    ctx,
    { ...(origin !== "all" ? { origin } : {}) },
    { skip, limit },
  );
  const entries = scan.members.map((member) =>
    JSON.stringify({
      id: member.fileId,
      filename: member.filename,
      tags: member.tags,
      firedRules: firedByFile.get(member.fileId) ?? [],
    }),
  );
  return immediateV2Result({
    summary: JSON.stringify({ total: scan.total, origins: scan.origins, matching: scan.matched }),
    entries,
    nextCursor: skip + entries.length < scan.matched ? String(skip + entries.length) : "",
  });
}

export function runLatestArrivals(ctx: V2HandlerContext) {
  const batch = latestArrival(ctx);
  const lastRun = readLastRun(ctx);
  return immediateV2Result({
    hasData: batch !== null,
    batch: batch ? JSON.stringify(batch) : "",
    lastRun: lastRun ? JSON.stringify(lastRun) : "",
  });
}

export async function runRemoveByOrigin(ctx: V2HandlerContext) {
  const input = inputRecord(ctx);
  if (input.confirm !== true) {
    throw new V2OperationError("input-invalid", "Confirm removal before changing automatic tag attachments.");
  }
  if (input.origin !== "deterministic" && input.origin !== "semantic_ai") {
    throw new V2OperationError("input-invalid", "Choose deterministic or semantic AI attachments.");
  }
  const removed = extendedOperationsOf(ctx).tags.detachByOrigin(input.origin);
  await recordCoverageAtBoundary(ctx);
  return immediateV2Result({ origin: input.origin, removed });
}

export function runRenameTag(ctx: V2HandlerContext) {
  const input = inputRecord(ctx);
  if (typeof input.tagId !== "string" || typeof input.name !== "string") {
    throw new V2OperationError("input-invalid", "Tag ID and name are required.");
  }
  extendedOperationsOf(ctx).tags.renamePreservingAlias(input.tagId, input.name);
  return immediateV2Result({ renamed: true });
}

export function runMergeTag(ctx: V2HandlerContext) {
  const input = inputRecord(ctx);
  if (input.confirm !== true || typeof input.sourceTagId !== "string" || typeof input.targetTagId !== "string") {
    throw new V2OperationError("input-invalid", "Choose two tags and confirm the merge.");
  }
  return immediateV2Result(extendedOperationsOf(ctx).tags.merge(input.sourceTagId, input.targetTagId));
}

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
  host.registerHandler(AUTO_TAG_V2_ID, AUTO_TAG_V2_CLAP_STATUS, runClapStatus);
  host.registerHandler(AUTO_TAG_V2_ID, AUTO_TAG_V2_DOWNLOAD_MODEL, (ctx) =>
    runDownloadModel(ctx),
  );
  host.registerHandler(AUTO_TAG_V2_ID, AUTO_TAG_V2_TAG_SEMANTIC, (ctx) => runTagSemantic(ctx));
  host.registerHandler(AUTO_TAG_V2_ID, AUTO_TAG_V2_COVERAGE_HISTORY, runCoverageHistory);
  host.registerHandler(AUTO_TAG_V2_ID, AUTO_TAG_V2_RECORD_COVERAGE, runRecordCoverage);
  host.registerHandler(AUTO_TAG_V2_ID, AUTO_TAG_V2_COVERAGE_SUMMARY, runCoverageSummary);
  host.registerHandler(AUTO_TAG_V2_ID, AUTO_TAG_V2_LIST_ORIGINS, runListOrigins);
  host.registerHandler(AUTO_TAG_V2_ID, AUTO_TAG_V2_LATEST_ARRIVALS, runLatestArrivals);
  host.registerHandler(AUTO_TAG_V2_ID, AUTO_TAG_V2_REMOVE_BY_ORIGIN, runRemoveByOrigin);
  host.registerHandler(AUTO_TAG_V2_ID, AUTO_TAG_V2_RENAME_TAG, runRenameTag);
  host.registerHandler(AUTO_TAG_V2_ID, AUTO_TAG_V2_MERGE_TAG, runMergeTag);
}
