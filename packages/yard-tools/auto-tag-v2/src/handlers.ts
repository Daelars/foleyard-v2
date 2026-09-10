import {
  extendedOperationsOf,
  immediateV2Result,
  isV2JobCancellation,
  V2OperationError,
  type ExtensionV2Host,
  type V2HandlerContext,
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
  MAX_CANDIDATES,
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

function readCandidates(ctx: V2HandlerContext): AutoTagCandidateRecord[] {
  const raw = ctx.operations.state.read(CANDIDATES_KEY);
  if (!Array.isArray(raw)) return [];
  return raw.filter((entry): entry is AutoTagCandidateRecord => {
    if (typeof entry !== "object" || entry === null) return false;
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
  });
}

function writeCandidates(ctx: V2HandlerContext, candidates: AutoTagCandidateRecord[]): void {
  ctx.operations.state.write(CANDIDATES_KEY, candidates.slice(0, MAX_CANDIDATES * 3));
}

function upsertCandidateSuggestions(
  ctx: V2HandlerContext,
  suggestions: Array<{
    label: string;
    source: AutoTagCandidateSource;
    confidence?: number | null;
    fileId: string;
  }>,
): void {
  if (suggestions.length === 0) return;
  const now = new Date().toISOString();
  const current = readCandidates(ctx);
  const byId = new Map(current.map((entry) => [entry.id, entry]));
  for (const suggestion of suggestions) {
    const id = candidateId(suggestion.source, suggestion.label);
    const existing = byId.get(id);
    if (existing) {
      if (existing.status !== "pending") continue;
      existing.occurrenceCount += 1;
      if (!existing.exampleFileIds.includes(suggestion.fileId) && existing.exampleFileIds.length < 12) {
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
    current.push(record);
    byId.set(id, record);
  }
  writeCandidates(ctx, current);
}

function ensureFilenameCandidates(ctx: V2HandlerContext): void {
  if (readCandidates(ctx).length > 0) return;
  const rules = readRules(ctx);
  const suggestions: Array<{ label: string; source: "filename_token"; fileId: string }> = [];
  let cursor: string | null = null;
  do {
    const page = ctx.operations.library.listPage(cursor, 500);
    for (const file of page.files) {
      if (file.removedAt !== null) continue;
      for (const label of unmatchedTokens(file.filename || `${file.id}.bin`, rules)) {
        suggestions.push({ label, source: "filename_token", fileId: file.id });
      }
    }
    cursor = page.nextCursor;
  } while (cursor);
  upsertCandidateSuggestions(ctx, suggestions);
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

  const filenameSuggestions = live.flatMap((file) =>
    unmatchedTokens(file.filename, rules).map((label) => ({
      label,
      source: "filename_token" as const,
      fileId: file.fileId,
    })),
  );
  upsertCandidateSuggestions(ctx, filenameSuggestions);

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
  recordCoverageAtBoundary(ctx, inputRecord(ctx).scanStartedAt as string | undefined);
  return immediateV2Result(result);
}

export type AutoTagV2ListCandidatesResult = {
  words: string[];
  lines: string[];
  entries: string[];
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
  const { tags } = extendedOperationsOf(ctx);
  ensureFilenameCandidates(ctx);
  const handled = new Set(tags.list().map((tag) => tag.name.toLowerCase()));
  const all = readCandidates(ctx)
    .filter((entry) => entry.status === "pending" && !handled.has(entry.label))
    .sort((a, b) => b.occurrenceCount - a.occurrenceCount || a.label.localeCompare(b.label));
  const entries = all.slice(0, limit);
  return immediateV2Result({
    words: entries.map((entry) => entry.label),
    lines: entries.map((entry) =>
      `${entry.label} - ${entry.occurrenceCount} occurrence${entry.occurrenceCount === 1 ? "" : "s"} from ${entry.source.replaceAll("_", " ")}`,
    ),
    entries: entries.map((entry) => JSON.stringify(entry)),
    truncated: all.length > entries.length,
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

  const candidates = readCandidates(ctx);
  const now = new Date().toISOString();
  for (const candidate of candidates) {
    if (candidate.label === word && candidate.status === "pending") {
      candidate.status = "promoted";
      candidate.updatedAt = now;
    }
  }
  writeCandidates(ctx, candidates);

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

export function runDismissCandidate(ctx: V2HandlerContext) {
  const word = readCandidateWord(ctx);
  ensureFilenameCandidates(ctx);
  const candidates = readCandidates(ctx);
  const now = new Date().toISOString();
  let dismissedCount = 0;
  for (const candidate of candidates) {
    if (candidate.label === word && candidate.status === "pending") {
      candidate.status = "dismissed";
      candidate.updatedAt = now;
      dismissedCount += 1;
    }
  }
  writeCandidates(ctx, candidates);
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

  upsertCandidateSuggestions(
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
  upsertCandidateSuggestions(
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
  recordCoverageAtBoundary(ctx, inputRecord(ctx).scanStartedAt as string | undefined);
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
};

/** Snapshots live in extension state, oldest first, bounded. */
export const COVERAGE_HISTORY_KEY = "coverage-history";
export const MAX_COVERAGE_SNAPSHOTS = 30;

function readSnapshots(ctx: V2HandlerContext): CoverageSnapshot[] {
  const raw: unknown = ctx.operations.state.read(COVERAGE_HISTORY_KEY);
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
    });
  }
  return out;
}

export function runCoverageHistory(ctx: V2HandlerContext) {
  return immediateV2Result({
    entries: readSnapshots(ctx).map((entry) => JSON.stringify(entry)),
  } satisfies AutoTagV2CoverageHistoryResult);
}

export function runRecordCoverage(ctx: V2HandlerContext) {
  const aggregate = aggregateLibrary(ctx);
  const snapshots = readSnapshots(ctx);
  snapshots.push({
    at: new Date().toISOString(),
    tagged: aggregate.tagged,
    total: aggregate.total,
    tags: aggregate.tags,
    invocationId: ctx.invocation.invocationId,
  });
  while (snapshots.length > MAX_COVERAGE_SNAPSHOTS) snapshots.shift();
  ctx.operations.state.write(COVERAGE_HISTORY_KEY, snapshots);
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

function aggregateLibrary(ctx: V2HandlerContext): {
  total: number;
  tagged: number;
  tags: Record<string, number>;
  allTags: string[];
  origins: Record<"manual" | "deterministic" | "semantic_ai", number>;
} {
  const { tags } = extendedOperationsOf(ctx);
  const tagCounts: Record<string, number> = {};
  const origins = { manual: 0, deterministic: 0, semantic_ai: 0 };
  let total = 0;
  let tagged = 0;
  let cursor: string | null = null;
  do {
    const page = ctx.operations.library.listPage(cursor, 500);
    const files = page.files.filter((file) => file.removedAt === null);
    const attachments = tags.attachmentsForFiles(files.map((file) => file.id));
    const byFile = new Map<string, typeof attachments>();
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
    }
    cursor = page.nextCursor;
  } while (cursor);
  return { total, tagged, tags: tagCounts, allTags: tags.list().map((tag) => tag.name), origins };
}

function recordCoverageAtBoundary(ctx: V2HandlerContext, scanId?: string): void {
  const aggregate = aggregateLibrary(ctx);
  const snapshots = readSnapshots(ctx);
  snapshots.push({
    at: new Date().toISOString(),
    tagged: aggregate.tagged,
    total: aggregate.total,
    tags: aggregate.tags,
    invocationId: ctx.invocation.invocationId,
    ...(scanId ? { scanId } : {}),
  });
  while (snapshots.length > MAX_COVERAGE_SNAPSHOTS) snapshots.shift();
  ctx.operations.state.write(COVERAGE_HISTORY_KEY, snapshots);
}

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
};

function latestArrival(ctx: V2HandlerContext): ArrivalBatch | null {
  const value = ctx.operations.state.read(LATEST_ARRIVALS_KEY);
  return typeof value === "object" && value !== null && Array.isArray((value as { files?: unknown }).files)
    ? (value as ArrivalBatch)
    : null;
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
  const input = inputRecord(ctx);
  ctx.operations.state.write(LATEST_ARRIVALS_KEY, {
    batchId: typeof input.batchId === "string" ? input.batchId : ctx.invocation.invocationId,
    ...(typeof input.scanStartedAt === "string" ? { scanStartedAt: input.scanStartedAt } : {}),
    invocationId: ctx.invocation.invocationId,
    completedAt: new Date().toISOString(),
    files: files.map((file) => {
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
    }),
  });
}

export function runCoverageSummary(ctx: V2HandlerContext) {
  const input = inputRecord(ctx);
  const selectedTag = typeof input.tag === "string" ? input.tag.trim().toLowerCase() : "";
  const skip = typeof input.cursor === "string" ? Math.max(0, Number.parseInt(input.cursor, 10) || 0) : 0;
  const limit = Math.max(1, Math.min(100, typeof input.limit === "number" ? Math.floor(input.limit) : 50));
  const aggregate = aggregateLibrary(ctx);
  const configuredRules = readRules(ctx);
  const members: string[] = [];
  let matched = 0;
  if (selectedTag) {
    let cursor: string | null = null;
    do {
      const page = ctx.operations.library.listPage(cursor, 500);
      const files = page.files.filter((file) => file.removedAt === null);
      const attachments = extendedOperationsOf(ctx).tags.attachmentsForFiles(files.map((file) => file.id));
      const byFile = new Map<string, typeof attachments>();
      for (const attachment of attachments) {
        const list = byFile.get(attachment.fileId) ?? [];
        list.push(attachment);
        byFile.set(attachment.fileId, list);
      }
      for (const file of files) {
        const fileAttachments = byFile.get(file.id) ?? [];
        if (!fileAttachments.some((attachment) => attachment.tagName.toLowerCase() === selectedTag)) continue;
        if (matched >= skip && members.length < limit) {
          members.push(JSON.stringify({
            id: file.id,
            filename: file.filename,
            tags: fileAttachments.map((attachment) => ({
              id: attachment.tagId,
              name: attachment.tagName,
              origin: attachment.origin,
              confidence: attachment.confidence,
            })),
          }));
        }
        matched += 1;
      }
      cursor = page.nextCursor;
    } while (cursor);
  }
  return immediateV2Result({
    summary: JSON.stringify({
      ...aggregate,
      members,
      nextCursor: skip + members.length < matched ? String(skip + members.length) : "",
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
  const aggregate = aggregateLibrary(ctx);
  const arrivals = latestArrival(ctx);
  const firedByFile = new Map(arrivals?.files.map((file) => [file.id, file.firedRules]) ?? []);
  const entries: string[] = [];
  let matched = 0;
  let cursor: string | null = null;
  do {
    const page = ctx.operations.library.listPage(cursor, 500);
    const files = page.files.filter((file) => file.removedAt === null);
    const attachments = extendedOperationsOf(ctx).tags.attachmentsForFiles(files.map((file) => file.id));
    const byFile = new Map<string, typeof attachments>();
    for (const attachment of attachments) {
      const list = byFile.get(attachment.fileId) ?? [];
      list.push(attachment);
      byFile.set(attachment.fileId, list);
    }
    for (const file of files) {
      const fileAttachments = byFile.get(file.id) ?? [];
      if (origin !== "all" && !fileAttachments.some((attachment) => attachment.origin === origin)) continue;
      if (matched >= skip && entries.length < limit) {
        entries.push(JSON.stringify({
          id: file.id,
          filename: file.filename,
          tags: fileAttachments.map((attachment) => ({
            id: attachment.tagId,
            name: attachment.tagName,
            origin: attachment.origin,
            confidence: attachment.confidence,
          })),
          firedRules: firedByFile.get(file.id) ?? [],
        }));
      }
      matched += 1;
    }
    cursor = page.nextCursor;
  } while (cursor);
  return immediateV2Result({
    summary: JSON.stringify({ total: aggregate.total, origins: aggregate.origins, matching: matched }),
    entries,
    nextCursor: skip + entries.length < matched ? String(skip + entries.length) : "",
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

export function runRemoveByOrigin(ctx: V2HandlerContext) {
  const input = inputRecord(ctx);
  if (input.confirm !== true) {
    throw new V2OperationError("input-invalid", "Confirm removal before changing automatic tag attachments.");
  }
  if (input.origin !== "deterministic" && input.origin !== "semantic_ai") {
    throw new V2OperationError("input-invalid", "Choose deterministic or semantic AI attachments.");
  }
  const removed = extendedOperationsOf(ctx).tags.detachByOrigin(input.origin);
  recordCoverageAtBoundary(ctx);
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
