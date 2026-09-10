// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useLibraryView } from "./use-library-view";

// Area: #227. If the shelf extension goes away while the shelf view is
// current, the view falls back to the Library instead of running the shelf
// load path against a disabled extension.

describe("useLibraryView shelf availability", () => {
  it("leaves the Library untouched when the shelf is available", () => {
    const { result } = renderHook(() => useLibraryView({ shelfAvailable: true }));
    act(() => {
      result.current.showLibrary();
    });
    expect(result.current.currentView).toBe("all");
  });

  it("redirects an open shelf to the Library when it becomes unavailable", () => {
    const { result, rerender } = renderHook(
      ({ shelfAvailable }: { shelfAvailable: boolean }) =>
        useLibraryView({ shelfAvailable }),
      { initialProps: { shelfAvailable: true } },
    );

    act(() => {
      result.current.showShelf();
    });
    expect(result.current.currentView).toBe("shelf");

    rerender({ shelfAvailable: false });
    expect(result.current.currentView).toBe("all");
  });

  it("keeps a non-shelf view when the shelf is unavailable", () => {
    const { result } = renderHook(() => useLibraryView({ shelfAvailable: false }));
    act(() => {
      result.current.showFavorites();
    });
    expect(result.current.currentView).toBe("favorites");
  });
});
