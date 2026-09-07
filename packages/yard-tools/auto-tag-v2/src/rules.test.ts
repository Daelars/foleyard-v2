import { describe, expect, it } from "vitest";

import {
  SEED_RULES,
  filenameMatchesToken,
  tagsForFilename,
  unmatchedTokens,
} from "./rules";

// Area: auto-tag v2 (#190). Filename rules are pure vocabulary: they fire
// tags for names and name the words they cannot cover.
describe("auto-tag filename rules", () => {
  it("matches tokens case-insensitively", () => {
    expect(filenameMatchesToken("THUNDER-distant_roll_01.WAV", "thunder")).toBe(true);
    expect(filenameMatchesToken("rain-barrel_overflow.wav", "thunder")).toBe(false);
    expect(filenameMatchesToken("rain-barrel_overflow.wav", "  ")).toBe(false);
  });

  it("collects every fired tag once in rule order", () => {
    expect(tagsForFilename("thunder-rain_storm.wav")).toEqual(["thunder", "weather", "rain"]);
    expect(tagsForFilename("paper-bag_crumple_fast.wav")).toEqual([]);
  });

  it("names uncovered words for the candidate queue", () => {
    expect(unmatchedTokens("horse-trot_gravel_01.wav")).toEqual(["horse", "trot"]);
    expect(unmatchedTokens("thunder-close_take01.wav")).toEqual(["close", "take01"]);
    expect(unmatchedTokens("rain.wav")).toEqual([]);
  });

  it("keeps a small seed with unique tokens", () => {
    expect(SEED_RULES.length).toBeLessThanOrEqual(20);
    const toks = SEED_RULES.map((rule) => rule.tok);
    expect(new Set(toks).size).toBe(toks.length);
    for (const rule of SEED_RULES) {
      expect(rule.tags.length).toBeGreaterThan(0);
    }
  });
});
