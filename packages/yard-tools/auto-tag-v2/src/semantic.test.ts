import { describe, expect, it } from "vitest";

import { clapPrompt, rankLabels, SEMANTIC_THRESHOLD } from "./semantic";

// Area: opt-in CLAP (#195). Zero-shot ranking is pure math: cosine
// against the approved vocabulary, thresholded and capped, best first.
describe("rankLabels", () => {
  it("keeps only labels at threshold, best first, capped", () => {
    const ranked = rankLabels(
      [1, 0],
      ["rain", "crowd", "glass"],
      [
        [0.9, 0.1],
        [0, 1],
        [0.7, 0.7],
      ],
      SEMANTIC_THRESHOLD,
      2,
    );
    expect(ranked.map((entry) => entry.label)).toEqual(["rain", "glass"]);
    expect(ranked[0]!.confidence).toBeGreaterThan(ranked[1]!.confidence);
  });

  it("returns nothing when nothing clears the bar", () => {
    expect(rankLabels([1, 0], ["crowd"], [[0, 1]])).toEqual([]);
  });

  it("prompts labels the CLAP way", () => {
    expect(clapPrompt("rain")).toBe("This is a sound of rain");
  });
});
