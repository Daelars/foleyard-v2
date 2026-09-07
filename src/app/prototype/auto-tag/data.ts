// PROTOTYPE ONLY — shared mock data and pure helpers for /prototype/auto-tag.
// Fake library, real component contract: variants render these through the
// production shadcn primitives and the generic v2 sidebar renderer.
export type MockFile = { id: string; filename: string; tags: string[] };
export type TagRule = { tok: string; tags: string[] };

export const COVERAGE_GOAL = 5;

export const INITIAL_FILES: MockFile[] = [
  { id: "f01", filename: "thunder-close_take01.wav", tags: ["thunder", "weather"] },
  { id: "f02", filename: "thunder-close_take02.wav", tags: [] },
  { id: "f03", filename: "gravel-scrape_close_01.wav", tags: ["gravel"] },
  { id: "f04", filename: "wooden-door_creak_long.wav", tags: [] },
  { id: "f05", filename: "rain-gutter_drip_metal.wav", tags: ["rain", "weather"] },
  { id: "f06", filename: "leather-jacket_rustle_03.wav", tags: [] },
  { id: "f07", filename: "glass-clink_bar_02.wav", tags: [] },
  { id: "f08", filename: "forest-night_crickets_bed.wav", tags: ["night", "ambience"] },
  { id: "f09", filename: "car-door_slam_interior.wav", tags: [] },
  { id: "f10", filename: "whoosh_large_01.wav", tags: [] },
  { id: "f11", filename: "whoosh_small_02.wav", tags: [] },
];

export const ARRIVAL_BATCH: MockFile[] = [
  { id: "f12", filename: "crowd-cheer_stadium_bed.wav", tags: [] },
  { id: "f13", filename: "thunder-distant_roll_01.wav", tags: [] },
  { id: "f14", filename: "whoosh_large_04.wav", tags: [] },
  { id: "f15", filename: "rain-barrel_overflow.wav", tags: [] },
  { id: "f16", filename: "wooden-door_slam_office.wav", tags: [] },
  { id: "f17", filename: "horse-trot_gravel_01.wav", tags: [] },
  { id: "f18", filename: "glass-shatter_hall_01.wav", tags: [] },
  { id: "f19", filename: "crowd-gasp_theatre_01.wav", tags: [] },
];

export const INITIAL_RULES: TagRule[] = [
  { tok: "whoosh", tags: ["whoosh", "movement"] },
  { tok: "thunder", tags: ["thunder", "weather"] },
  { tok: "rain", tags: ["rain", "weather"] },
  { tok: "crowd", tags: ["crowd"] },
];

export function filenameMatchesToken(filename: string, tok: string): boolean {
  return filename.toLowerCase().includes(tok.trim().toLowerCase());
}

export function tagsForFilename(filename: string, rules: TagRule[]): string[] {
  const out: string[] = [];
  for (const rule of rules) {
    if (!filenameMatchesToken(filename, rule.tok)) continue;
    for (const tag of rule.tags) {
      if (!out.includes(tag)) out.push(tag);
    }
  }
  return out;
}

/** Return files with rule tags merged in; restricted to `onlyIds` when given. */
export function withAutoTags(
  files: MockFile[],
  rules: TagRule[],
  onlyIds?: Set<string>,
): MockFile[] {
  return files.map((file) => {
    if (onlyIds && !onlyIds.has(file.id)) return file;
    const extra = tagsForFilename(file.filename, rules).filter(
      (tag) => !file.tags.includes(tag),
    );
    return extra.length > 0 ? { ...file, tags: [...file.tags, ...extra] } : file;
  });
}

export function tagCoverage(files: MockFile[], tag: string): number {
  return files.filter((file) => file.tags.includes(tag)).length;
}

export const SCANS = ["s1", "s2", "s3", "s4", "s5", "s6"];

/** Deterministic mock: cumulative coverage of one tag across SCANS, ending at finalCount. */
export function mockTagHistory(tok: string, finalCount: number): number[] {
  let h = 2166136261;
  const mix = (n: number) => {
    h ^= n;
    h = Math.imul(h, 16777619);
    h >>>= 0;
  };
  for (const c of tok) mix(c.charCodeAt(0));
  const rnd = () => {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    h >>>= 0;
    return h / 4294967295;
  };
  const weights = SCANS.map(() => 0.3 + rnd());
  const sum = weights.reduce((a, b) => a + b, 0);
  let acc = 0;
  return weights.map((w, i) => {
    if (i === weights.length - 1) return finalCount;
    acc = Math.min(finalCount, acc + Math.max(0, Math.round((finalCount * w) / sum)));
    return acc;
  });
}
