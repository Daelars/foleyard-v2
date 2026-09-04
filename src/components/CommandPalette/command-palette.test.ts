import { describe, expect, it } from "vitest";

import {
  PALETTE_SOUND_LIMIT,
  buildPaletteEntries,
  type PaletteBuildInput,
  type PaletteSound,
  type PaletteToolCommand,
} from "./command-palette";

const toolCommands: PaletteToolCommand[] = [
  {
    extensionId: "folder-janitor",
    extensionName: "Folder Janitor",
    commandId: "folder-janitor.scan-library",
    title: "Scan library",
  },
  {
    extensionId: "make-pack",
    extensionName: "Make Pack",
    commandId: "make-pack.from-recent",
    title: "Pack recent sounds",
  },
];

const sounds: PaletteSound[] = [
  { id: "a", filename: "rain-loop.wav", format: "wav", duration: 65, tags: ["ambient"] },
  { id: "b", filename: "kick-hard.wav", format: "wav", duration: 2, tags: ["drums"] },
  { id: "c", filename: "night-crickets.mp3", format: "mp3", duration: 125, tags: ["ambient", "field"] },
  { id: "d", filename: "snare-1.wav", format: "wav", duration: 3, tags: ["drums"] },
  { id: "e", filename: "snare-2.wav", format: "wav", duration: 3, tags: ["drums"] },
  { id: "f", filename: "hihat.wav", format: "wav", duration: 1, tags: ["drums"] },
  { id: "g", filename: "bass-drop.wav", format: "wav", duration: 8, tags: ["bass"] },
  { id: "h", filename: "vocal-chop.wav", format: "wav", duration: 4, tags: ["vocal"] },
];

function baseInput(overrides: Partial<PaletteBuildInput> = {}): PaletteBuildInput {
  return {
    query: "",
    isPlaying: false,
    autoplay: false,
    hasCurrentFile: true,
    canStepQueue: true,
    isFavorite: false,
    shelfEnabled: true,
    toolCommands,
    sounds,
    ...overrides,
  };
}

describe("palette command builder", () => {
  it("maps the view, transport, file, and tool sections on an empty query", () => {
    const entries = buildPaletteEntries(baseInput());

    expect(entries.map((entry) => entry.id)).toEqual([
      "view:library",
      "view:favorites",
      "view:shelf",
      "view:tools",
      "view:settings",
      "transport:toggle-play",
      "transport:next",
      "transport:prev",
      "transport:autoplay",
      "file:toggle-favorite",
      "file:add-to-shelf",
      "tool:folder-janitor:folder-janitor.scan-library",
      "tool:make-pack:make-pack.from-recent",
      "sound:a",
      "sound:b",
      "sound:c",
      "sound:d",
      "sound:e",
      "sound:f",
    ]);
  });

  it("keeps sections ordered view, transport, file, tool, sound", () => {
    const entries = buildPaletteEntries(baseInput({ query: "a" }));
    const order = ["view", "transport", "file", "tool", "sound"];

    const positions = entries.map((entry) => order.indexOf(entry.section));
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it("reflects playback, favorite, and autoplay state in labels", () => {
    const entries = buildPaletteEntries(
      baseInput({ isPlaying: true, isFavorite: true, autoplay: true }),
    );
    const byId = new Map(entries.map((entry) => [entry.id, entry.label]));

    expect(byId.get("transport:toggle-play")).toBe("Pause");
    expect(byId.get("file:toggle-favorite")).toBe("Unsave current");
    expect(byId.get("transport:autoplay")).toBe("Autoplay off");
  });

  it("gates transport and file rows on availability", () => {
    const entries = buildPaletteEntries(
      baseInput({
        hasCurrentFile: false,
        canStepQueue: false,
        shelfEnabled: false,
      }),
    );
    const ids = entries.map((entry) => entry.id);

    expect(ids).not.toContain("transport:toggle-play");
    expect(ids).not.toContain("transport:next");
    expect(ids).not.toContain("transport:prev");
    expect(ids).not.toContain("file:toggle-favorite");
    expect(ids).not.toContain("file:add-to-shelf");
    expect(ids).toContain("transport:autoplay");
    expect(ids).toContain("view:library");
  });

  it("matches tool rows by extension name without drifting from the registry", () => {
    const entries = buildPaletteEntries(baseInput({ query: "janitor" }));

    expect(entries.map((entry) => entry.id)).toEqual([
      "tool:folder-janitor:folder-janitor.scan-library",
    ]);
  });

  it("jumps to sounds by filename or tag and caps the list", () => {
    const drums = buildPaletteEntries(baseInput({ query: "drums" }));

    expect(drums.map((entry) => entry.id)).toEqual([
      "sound:b",
      "sound:d",
      "sound:e",
      "sound:f",
    ]);

    const all = buildPaletteEntries(baseInput());
    expect(
      all.filter((entry) => entry.section === "sound"),
    ).toHaveLength(PALETTE_SOUND_LIMIT);
  });

  it("finds the Tools view through the legacy Extensions name", () => {
    const entries = buildPaletteEntries(baseInput({ query: "extensions" }));

    expect(entries.map((entry) => entry.id)).toEqual(["view:tools"]);
  });
});
