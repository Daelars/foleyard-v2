// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { usePalette, type PaletteInput } from "./use-palette";
import type { FileRecord } from "./types";

// Area: #259. Entry and cursor churn (file loads, selection, typing) must not
// re-subscribe the global key listeners.

function file(id: string): FileRecord {
  return {
    id,
    filename: `${id}.wav`,
    path: `/lib/${id}.wav`,
    directory: null,
    format: "wav",
    duration: 1,
    fileSize: 100,
    isFavorite: false,
    tags: [],
  };
}

function input(overrides: Partial<PaletteInput> = {}): PaletteInput {
  const noop = () => {};
  return {
    orderedFiles: [file("a")],
    isPlaying: false,
    autoplay: false,
    selectedFile: null,
    canStepQueue: false,
    shelfEnabled: true,
    autoTagEnabled: false,
    showLibrary: noop,
    showFavorites: noop,
    showShelf: noop,
    showExtensions: noop,
    showOrganize: noop,
    showAutoTag: noop,
    openSettings: noop,
    togglePlayback: noop,
    stepNext: noop,
    stepPrev: noop,
    toggleAutoplay: noop,
    toggleFavoriteCurrent: noop,
    addCurrentToShelf: noop,
    playSound: noop,
    moveNext: noop,
    movePrev: noop,
    ...overrides,
  };
}

describe("usePalette key listeners", () => {
  it("keeps one keydown subscription across entry and cursor changes", () => {
    const addSpy = vi.spyOn(window, "addEventListener");
    const keydownCount = () =>
      addSpy.mock.calls.filter(([type]) => type === "keydown").length;

    const { rerender } = renderHook(
      (props: PaletteInput) => usePalette(props),
      { initialProps: input() },
    );
    const initial = keydownCount();
    expect(initial).toBeGreaterThan(0);

    rerender(
      input({
        orderedFiles: [file("a"), file("b")],
        selectedFile: file("a"),
        isPlaying: true,
      }),
    );
    expect(keydownCount()).toBe(initial);

    addSpy.mockRestore();
  });
});
