import { describe, expect, it } from "vitest";

import { createExtensionMatcher, isSupportedAudioFile, makeUniqueFilename } from "yard-core";

describe("canonical extension matching", () => {
  it.each([
    ["hit.mp3", true],
    ["hit.MP3", true],
    ["loop.ogg", true],
    ["UPPER.OGG", true],
    ["take.aiff", true],
    ["STEM.WAV", true],
    ["a.b.c.FLAC", true],
    ["x.m4a", true],
    [".hidden.mp3", true],
    ["noext", false],
    ["trail.", false],
    ["cover.jpg", false],
  ])("classifies %s as %s", (name, expected) => {
    expect(isSupportedAudioFile(name)).toBe(expected);
  });
});

describe("canonical unique naming", () => {
  it("returns the base name when nothing is taken", () => {
    expect(makeUniqueFilename(new Set(), () => false, "mix.wav")).toBe("mix.wav");
  });

  it("suffixes past planned names case-insensitively in Finder style", () => {
    const planned = new Set(["mix.wav"]);
    expect(makeUniqueFilename(planned, () => false, "MIX.wav")).toBe("MIX 2.wav");
  });

  it("never returns a name that exists on disk", () => {
    const onDisk = new Set(["mix.wav", "mix 2.wav"]);
    expect(makeUniqueFilename(new Set(), (name) => onDisk.has(name.toLowerCase()), "mix.wav")).toBe(
      "mix 3.wav",
    );
  });

  it("keeps the extension on the suffixed name, and copes without one", () => {
    expect(makeUniqueFilename(new Set(["a.b.c.flac"]), () => false, "a.b.c.FLAC")).toBe("a.b.c 2.FLAC");
    expect(makeUniqueFilename(new Set(["readme"]), () => false, "README")).toBe("README 2");
  });

  it("records what it hands out so a run cannot collide with itself", () => {
    const planned = new Set<string>();
    const first = makeUniqueFilename(planned, () => false, "take.wav");
    const second = makeUniqueFilename(planned, () => false, "take.wav");
    expect([first, second]).toEqual(["take.wav", "take 2.wav"]);
  });
});

describe("parameterized extension matching", () => {
  it("normalizes dot prefixes and case on custom lists", () => {
    const matches = createExtensionMatcher(["wav", ".MP3"]);
    expect(matches("hit.wav")).toBe(true);
    expect(matches("HIT.WAV")).toBe(true);
    expect(matches("song.mp3")).toBe(true);
    expect(matches("loop.ogg")).toBe(false);
    expect(matches("noext")).toBe(false);
  });
});
