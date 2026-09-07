/**
 * Auto-tag filename rules (Yard Tools context, #190).
 *
 * Pure vocabulary: a token fired by a filename maps to its tags. The seed
 * list is deliberately small (~12 rules): deterministic matching trades
 * recall for precision, and every word no rule fires on becomes a
 * candidate for the explicit-accept queue (#191) instead of a guess.
 *
 * Framework-free: no database, no host, no filesystem. Handlers apply
 * these through the v2 tag operations so every write lands marked
 * deterministic.
 */

export type TagRule = { tok: string; tags: string[] };

/** Seed vocabulary: one common sound per rule, each with its tags. */
export const SEED_RULES: TagRule[] = [
  { tok: "whoosh", tags: ["whoosh", "movement"] },
  { tok: "thunder", tags: ["thunder", "weather"] },
  { tok: "rain", tags: ["rain", "weather"] },
  { tok: "crowd", tags: ["crowd"] },
  { tok: "glass", tags: ["glass"] },
  { tok: "wood", tags: ["wood"] },
  { tok: "creak", tags: ["creak"] },
  { tok: "door", tags: ["door"] },
  { tok: "slam", tags: ["slam"] },
  { tok: "gravel", tags: ["gravel", "footstep"] },
  { tok: "night", tags: ["night", "ambience"] },
  { tok: "wind", tags: ["wind", "weather"] },
];

/** Per-invocation bound so one call cannot walk the whole library. */
export const MAX_TAG_FILES = 500;

/** How many files the candidate walk scans before reporting truncated. */
export const MAX_QUEUE_FILES = 2000;

/** How many candidates one listing returns at most. */
export const MAX_CANDIDATES = 100;

export function filenameMatchesToken(filename: string, tok: string): boolean {
  const clean = tok.trim().toLowerCase();
  if (!clean) return false;
  return filename.toLowerCase().includes(clean);
}

/** Every tag the rules fire for one filename, deduplicated in rule order. */
export function tagsForFilename(filename: string, rules: TagRule[] = SEED_RULES): string[] {
  const out: string[] = [];
  for (const rule of rules) {
    if (!filenameMatchesToken(filename, rule.tok)) continue;
    for (const tag of rule.tags) {
      if (!out.includes(tag)) out.push(tag);
    }
  }
  return out;
}

/**
 * Words in a filename no rule fires on: the candidate queue's raw
 * material. Short fragments, extensions, and numbers never qualify.
 */
export function unmatchedTokens(filename: string, rules: TagRule[] = SEED_RULES): string[] {
  const out: string[] = [];
  for (const word of filename.toLowerCase().split(/[^a-z0-9]+/)) {
    if (!word || word === "wav" || word.length < 3 || /^\d+$/.test(word)) continue;
    if (out.includes(word)) continue;
    if (rules.some((rule) => filenameMatchesToken(word, rule.tok))) continue;
    out.push(word);
  }
  return out;
}

/** One uncovered word with an example file and a file count. */
export type CandidateEntry = {
  word: string;
  exampleFileId: string;
  exampleFilename: string;
  fileCount: number;
};

/**
 * Aggregate uncovered words across files in first-seen order, skipping
 * dismissed words. Pure: the handler supplies the file window and the
 * persisted dismissed set.
 */
export function collectCandidates(
  files: Array<{ id: string; filename: string }>,
  rules: TagRule[] = SEED_RULES,
  dismissed: ReadonlySet<string> = new Set(),
  maxCandidates: number = MAX_CANDIDATES,
): CandidateEntry[] {
  const byWord = new Map<string, CandidateEntry>();
  for (const file of files) {
    for (const word of unmatchedTokens(file.filename, rules)) {
      if (dismissed.has(word)) continue;
      const entry = byWord.get(word);
      if (entry) {
        entry.fileCount += 1;
        continue;
      }
      if (byWord.size >= maxCandidates) continue;
      byWord.set(word, {
        word,
        exampleFileId: file.id,
        exampleFilename: file.filename,
        fileCount: 1,
      });
    }
  }
  return [...byWord.values()];
}

/** Normalize a candidate word from input; null when it cannot be one. */
export function cleanCandidateWord(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const word = value.trim().toLowerCase();
  if (!word || word.length < 3 || /^\d+$/.test(word)) return null;
  return word;
}
