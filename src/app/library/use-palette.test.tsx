// @vitest-environment jsdom
import { act, fireEvent, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { usePalette, type PaletteInput } from "./use-palette";

// Area: command palette focus. Opening moves focus into the palette query
// and closing (button or Escape) returns it to whatever held focus before,
// so keyboard users never lose their place in the workspace.
const noop = () => {};

const input: PaletteInput = {
  orderedFiles: [],
  isPlaying: false,
  autoplay: false,
  selectedFile: null,
  canStepQueue: false,
  shelfEnabled: false,
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
};

function opener(): HTMLButtonElement {
  const element = document.createElement("button");
  document.body.append(element);
  element.focus();
  return element;
}

describe("usePalette focus", () => {
  it("moves focus into the palette on open and restores it on close", () => {
    const { result } = renderHook(() => usePalette(input));
    const query = document.createElement("input");
    document.body.append(query);
    result.current.paletteInputRef.current = query;
    const trigger = opener();

    act(() => {
      result.current.openPalette();
    });
    expect(result.current.paletteOpen).toBe(true);
    expect(document.activeElement).toBe(query);

    act(() => {
      result.current.closePalette();
    });
    expect(result.current.paletteOpen).toBe(false);
    expect(document.activeElement).toBe(trigger);

    query.remove();
    trigger.remove();
  });

  it("opens on mod+k and closes on escape with focus restored", () => {
    const { result } = renderHook(() => usePalette(input));
    const trigger = opener();

    act(() => {
      fireEvent.keyDown(window, { key: "k", metaKey: true });
    });
    expect(result.current.paletteOpen).toBe(true);

    act(() => {
      fireEvent.keyDown(window, { key: "Escape" });
    });
    expect(result.current.paletteOpen).toBe(false);
    expect(document.activeElement).toBe(trigger);

    trigger.remove();
  });
});
