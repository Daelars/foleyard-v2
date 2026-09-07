import { describe, expect, it } from "vitest";

import {
  audioExtensionSet,
  baseName,
  extensionOf,
  isAudioFile,
  plannedOutputName,
  reserveUniqueName,
  splitName,
} from "./policy";

// Area: extension v2 G5 (#180). Pure gather policy: audio matching,
// flat output-name planning, and case-insensitive dedupe.

describe("audio matching", () => {
  const allowed = audioExtensionSet();
  it("matches known audio extensions case-insensitively", () => {
    expect(isAudioFile("Kick.WAV", allowed)).toBe(true);
    expect(isAudioFile("loop.flac", allowed)).toBe(true);
  });
  it("rejects non-audio and extensionless files", () => {
    expect(isAudioFile("notes.txt", allowed)).toBe(false);
    expect(isAudioFile("README", allowed)).toBe(false);
  });
  it("honors a custom extension list", () => {
    const custom = audioExtensionSet([".xyz"]);
    expect(isAudioFile("weird.xyz", custom)).toBe(true);
    expect(isAudioFile("kick.wav", custom)).toBe(false);
  });
});

describe("extensionOf / splitName / baseName", () => {
  it("splits names and paths", () => {
    expect(extensionOf("a.WAV")).toBe("wav");
    expect(splitName("a.wav")).toEqual(["a", ".wav"]);
    expect(splitName("noext")).toEqual(["noext", ""]);
    expect(baseName("/media/Pack A/kick.wav")).toBe("kick.wav");
    expect(baseName("C:\\Drops\\Pack\\")).toBe("Pack");
  });
});

describe("plannedOutputName", () => {
  it("prefixes the source folder name when preserving", () => {
    expect(plannedOutputName("kick.wav", "Pack A", true)).toBe("Pack A - kick.wav");
  });
  it("keeps the bare filename when not preserving", () => {
    expect(plannedOutputName("kick.wav", "Pack A", false)).toBe("kick.wav");
  });
});

describe("reserveUniqueName", () => {
  it("dedupes case-insensitive collisions with numbered suffixes", () => {
    const used = new Set<string>();
    expect(reserveUniqueName(used, "kick.wav")).toBe("kick.wav");
    expect(reserveUniqueName(used, "KICK.wav")).toBe("KICK 2.wav");
    expect(reserveUniqueName(used, "kick.wav")).toBe("kick 3.wav");
  });
});
