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
