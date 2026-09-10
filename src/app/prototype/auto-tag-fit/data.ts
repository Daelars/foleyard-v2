// PROTOTYPE ONLY — mock data for /prototype/auto-tag-fit.
// Shaped like the real board's data so the redesign variants reproduce the
// full current UI (rail, charts, arrivals, queue, run panels) with only the
// flagged pieces fixed. Numbers mirror the critique: 15k untagged of 16k,
// CLAP last run 9/7 19:25 → 0 tagged / 500 skipped.

export const COVERAGE_GOAL = 5;
export const TOTAL_FILES = 16032;
export const TAGGED_FILES = 785;
export const UNTAGGED_FILES = TOTAL_FILES - TAGGED_FILES;

export function fmt(n: number) {
  return n.toLocaleString("en-US");
}
export function formatCount(value: number): string {
  if (value >= 1_000_000) return `${Math.round(value / 1_000_000)}M`;
  if (value >= 10_000) return `${Math.round(value / 1_000)}k`;
  return String(value);
}

export type Snapshot = { at: string; tagged: number; total: number; tags: Record<string, number> };

export const SNAPSHOTS: Snapshot[] = [
  { at: "2026-09-03T09:00:00", tagged: 220, total: 14900, tags: { thunder: 1, rain: 0, gravel: 0, weather: 1, whoosh: 0 } },
  { at: "2026-09-04T09:00:00", tagged: 340, total: 15100, tags: { thunder: 2, rain: 1, gravel: 0, weather: 2, whoosh: 0 } },
  { at: "2026-09-05T09:00:00", tagged: 505, total: 15420, tags: { thunder: 4, rain: 1, gravel: 1, weather: 4, whoosh: 1 } },
  { at: "2026-09-06T09:00:00", tagged: 660, total: 15760, tags: { thunder: 5, rain: 2, gravel: 1, weather: 5, whoosh: 2 } },
];

export type RailRowData = { tag: string; count: number; toks: string[]; delta: number };
export const RAIL_ROWS: RailRowData[] = [
  { tag: "thunder", count: 5, toks: ["thunder"], delta: 1 },
  { tag: "weather", count: 5, toks: ["thunder", "rain"], delta: 0 },
  { tag: "rain", count: 3, toks: ["rain"], delta: 1 },
  { tag: "whoosh", count: 2, toks: ["whoosh"], delta: 1 },
  { tag: "gravel", count: 2, toks: [], delta: 0 },
];

export type MemberFile = { id: string; filename: string; tags: Array<{ id: string; name: string }> };
export const MEMBERS: MemberFile[] = [
  { id: "m1", filename: "thunder-close_take01.wav", tags: [{ id: "t1", name: "thunder" }, { id: "t2", name: "weather" }] },
  { id: "m2", filename: "thunder-distant_roll_01.wav", tags: [{ id: "t1", name: "thunder" }] },
  { id: "m3", filename: "thunder-crack_sharp_02.wav", tags: [{ id: "t1", name: "thunder" }, { id: "t3", name: "impact" }] },
];
export const MEMBER_TOTAL = 5;

export type Arrival = { id: string; filename: string; missed: boolean; tags: string[]; fired: string[] };
export const ARRIVALS: Arrival[] = [
  { id: "a1", filename: "crowd-cheer_stadium_bed.wav", missed: true, tags: [], fired: [] },
  { id: "a2", filename: "thunder-distant_roll_02.wav", missed: false, tags: ["thunder", "weather"], fired: ["thunder"] },
  { id: "a3", filename: "whoosh_large_04.wav", missed: false, tags: ["whoosh", "movement"], fired: ["whoosh"] },
  { id: "a4", filename: "wooden-door_slam_office.wav", missed: true, tags: [], fired: [] },
  { id: "a5", filename: "rain-barrel_overflow.wav", missed: false, tags: ["rain", "weather"], fired: ["rain"] },
];

export const QUEUE = [
  { word: "whoosh", line: "whoosh — 34 files, e.g. whoosh_large_01.wav" },
  { word: "sizzle", line: "sizzle — 12 files, e.g. pan-sizzle_kitchen_close.wav" },
  { word: "rumble", line: "rumble — 27 files, e.g. rumble-low_room_tone.wav" },
  { word: "ambience", line: "ambience — 9 files, e.g. forest-night_crickets_bed.wav" },
  { word: "impact", line: "impact — 41 files, e.g. impact-metal_hit_03.wav" },
  { word: "paper", line: "paper — 1 file, e.g. paper-bag_crumple_fast.wav" },
];
export const QUEUE_TOTAL = 23;
export const QUEUE_COMPACT = QUEUE.slice(0, 3);

export const LAST_RULES_RUN = { at: "9/2 08:14", tagged: 2208 };
export const LAST_CLAP_RUN = { at: "9/7 19:25", tagged: 0, attached: 0, skipped: 500 };

export const ORIGIN_SUMMARY = { total: 16032, manual: 412, rule: 2208, ai: 0 };
export const ORIGIN_FILTERS = [
  { value: "all", label: "All" },
  { value: "manual", label: "Manual" },
  { value: "deterministic", label: "Deterministic" },
  { value: "semantic_ai", label: "Semantic AI" },
];

// Tag origins tab — file list rows.
export type OriginFileRow = {
  id: string;
  filename: string;
  tags: Array<{ id: string; name: string; origin: "manual" | "deterministic" | "semantic_ai" }>;
  fired: Array<{ token: string; tags: string[] }>;
};
export const ORIGIN_FILES: OriginFileRow[] = [
  { id: "o1", filename: "thunder-close_take01.wav", tags: [{ id: "t1", name: "thunder", origin: "deterministic" }, { id: "t2", name: "weather", origin: "manual" }], fired: [{ token: "thunder", tags: ["thunder", "weather"] }] },
  { id: "o2", filename: "rain-gutter_drip_metal.wav", tags: [{ id: "t3", name: "rain", origin: "deterministic" }], fired: [{ token: "rain", tags: ["rain", "weather"] }] },
  { id: "o3", filename: "forest-night_crickets_bed.wav", tags: [{ id: "t4", name: "night", origin: "manual" }, { id: "t5", name: "ambience", origin: "manual" }], fired: [] },
  { id: "o4", filename: "car-door_slam_interior.wav", tags: [], fired: [] },
  { id: "o5", filename: "whoosh_large_01.wav", tags: [], fired: [] },
  { id: "o6", filename: "glass-clink_bar_02.wav", tags: [], fired: [] },
];
