import { describe, expect, it, vi } from "vitest";

import {
  buildPaletteEntries,
  type PaletteBuildInput,
} from "@/components/CommandPalette/command-palette";

import {
  BUILTIN_COMMANDS,
  BUILTIN_COMMAND_ACTIONS,
  dispatchBuiltinCommand,
  isBuiltinCommandId,
  type BuiltinCommandHandlers,
} from "./commands";

// Area: #242. One descriptor table owns the built-in palette actions; the
// builder renders from it and dispatch routes through its action map.

const BASE: PaletteBuildInput = {
  query: "",
  isPlaying: false,
  autoplay: false,
  hasCurrentFile: false,
  canStepQueue: false,
  isFavorite: false,
  shelfEnabled: false,
  autoTagEnabled: false,
  sounds: [],
};

const ids = (overrides: Partial<PaletteBuildInput> = {}) =>
  buildPaletteEntries({ ...BASE, ...overrides }).map((entry) => entry.id);

const label = (id: string, overrides: Partial<PaletteBuildInput> = {}) =>
  buildPaletteEntries({ ...BASE, ...overrides }).find((entry) => entry.id === id)
    ?.label;

describe("built-in command descriptors", () => {
  it("declares a unique id and one action for every built-in", () => {
    const tableIds = BUILTIN_COMMANDS.map((command) => command.id);
    expect(new Set(tableIds).size).toBe(tableIds.length);
    expect([...tableIds].sort()).toEqual(
      Object.keys(BUILTIN_COMMAND_ACTIONS).sort(),
    );
    for (const id of tableIds) {
      expect(isBuiltinCommandId(id), id).toBe(true);
    }
    expect(isBuiltinCommandId("v2tool:x:y")).toBe(false);
  });

  it("gates shelf, auto-tag, transport and file entries", () => {
    expect(ids()).not.toContain("view:shelf");
    expect(ids({ shelfEnabled: true })).toContain("view:shelf");
    expect(ids()).not.toContain("view:auto-tag");
    expect(ids({ autoTagEnabled: true })).toContain("view:auto-tag");
    expect(ids()).not.toContain("transport:toggle-play");
    expect(ids({ hasCurrentFile: true })).toContain("transport:toggle-play");
    expect(ids()).not.toContain("transport:next");
    expect(ids({ canStepQueue: true })).toContain("transport:next");
    expect(ids({ hasCurrentFile: true })).not.toContain("file:add-to-shelf");
    expect(ids({ hasCurrentFile: true, shelfEnabled: true })).toContain(
      "file:add-to-shelf",
    );
  });

  it("keeps the context-dependent titles", () => {
    expect(
      label("transport:toggle-play", { hasCurrentFile: true, isPlaying: true }),
    ).toBe("Pause");
    expect(label("transport:toggle-play", { hasCurrentFile: true })).toBe("Play");
    expect(label("transport:autoplay", { autoplay: true })).toBe("Autoplay off");
    expect(label("transport:autoplay")).toBe("Autoplay on");
    expect(
      label("file:toggle-favorite", { hasCurrentFile: true, isFavorite: true }),
    ).toBe("Unsave current");
    expect(label("file:toggle-favorite", { hasCurrentFile: true })).toBe(
      "Save current",
    );
  });

  it("searches titles and keywords", () => {
    expect(ids({ query: "organize" })).toContain("view:organize");
    expect(ids({ query: "collections" })).toContain("view:organize");
    expect(ids({ query: "tagging", autoTagEnabled: true })).toContain(
      "view:auto-tag",
    );
    expect(ids({ query: "unsave", hasCurrentFile: true })).toContain(
      "file:toggle-favorite",
    );
  });

  it("dispatches every built-in id to its handler exactly once", () => {
    const handlers = Object.fromEntries(
      Object.values(BUILTIN_COMMAND_ACTIONS).map((action) => [action, vi.fn()]),
    ) as unknown as BuiltinCommandHandlers;

    for (const [id, action] of Object.entries(BUILTIN_COMMAND_ACTIONS)) {
      vi.clearAllMocks();
      expect(dispatchBuiltinCommand(id, handlers), id).toBe(true);
      expect(handlers[action], id).toHaveBeenCalledTimes(1);
    }

    vi.clearAllMocks();
    expect(dispatchBuiltinCommand("sound:abc", handlers)).toBe(false);
    for (const handler of Object.values(handlers)) {
      expect(handler).not.toHaveBeenCalled();
    }
  });
});
