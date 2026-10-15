import { describe, expect, it } from "vitest";

import { describeMediaError } from "./playback-error";

// Area: #291. Media failures must produce a readable explanation instead of a
// silent stall: network errors, decode failures and unsupported/missing
// sources all map to distinct recoverable messages.

describe("describeMediaError", () => {
  it("names network failures", () => {
    expect(describeMediaError({ code: 2 })).toMatch(/network/i);
  });

  it("names decode and codec failures", () => {
    expect(describeMediaError({ code: 3 })).toMatch(/decode|codec|damaged/i);
  });

  it("names unsupported or missing sources", () => {
    expect(describeMediaError({ code: 4 })).toMatch(/missing|unsupported|format/i);
  });

  it("falls back to a generic explanation when no code is known", () => {
    expect(describeMediaError(null)).toMatch(/could not be played/i);
    expect(describeMediaError({ code: 99 })).toMatch(/could not be played/i);
  });
});
