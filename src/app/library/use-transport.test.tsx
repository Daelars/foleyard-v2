// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { FileRecord } from "./types";
import { resolveNextTitle, useTransport } from "./use-transport";

// Area: #291. Transport behavior across view transitions and delayed records:
// the queue keeps its snapshot, advances to the snapshotted record (preferring
// a newer copy when the same id reloaded), and explains when it cannot.

function file(id: string, overrides: Partial<FileRecord> = {}): FileRecord {
  return {
    id,
    filename: `${id}.wav`,
    path: `/lib/${id}.wav`,
    directory: null,
    format: "wav",
    duration: null,
    fileSize: null,
    isFavorite: false,
    tags: [],
    ...overrides,
  };
}

describe("useTransport view transitions", () => {
  it("keeps the snapshotted queue after the view changes and advances into it", () => {
    const { result } = renderHook(() => useTransport());
    const [a, b, c] = [file("a"), file("b"), file("c")];

    act(() => {
      result.current.playFile([a, b, c], b, "Library");
    });
    expect(result.current.queueState.queue.map((entry) => entry.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
    expect(result.current.playingFrom).toBe("Library");

    // The user navigated to a different view that no longer lists the queue.
    const focusFile = vi.fn();
    let outcome: ReturnType<typeof result.current.stepTo> | undefined;
    act(() => {
      outcome = result.current.stepTo("next", { files: [file("z")], focusFile });
    });

    expect(outcome?.ok).toBe(true);
    expect(outcome?.track?.id).toBe("c");
    expect(focusFile).toHaveBeenCalledWith(expect.objectContaining({ id: "c" }));
  });

  it("explains when there is nothing else to advance to", () => {
    const { result } = renderHook(() => useTransport());
    const only = file("only");

    act(() => {
      result.current.playFile([only], only, "Library");
    });

    const focusFile = vi.fn();
    let outcome: ReturnType<typeof result.current.stepTo> | undefined;
    act(() => {
      outcome = result.current.stepTo("next", { files: [only], focusFile });
    });

    expect(outcome?.ok).toBe(false);
    expect(outcome?.reason).toMatch(/nothing else/i);
    expect(focusFile).not.toHaveBeenCalled();
  });

  it("prefers the freshly loaded record for a delayed track", () => {
    const { result } = renderHook(() => useTransport());
    const staleB = file("b");
    act(() => {
      result.current.playFile([file("a"), staleB, file("c")], file("a"), "Library");
    });

    const freshB = file("b", { duration: 42, isFavorite: true });
    const focusFile = vi.fn();
    let outcome: ReturnType<typeof result.current.stepTo> | undefined;
    act(() => {
      outcome = result.current.stepTo("next", {
        files: [file("a"), freshB, file("c")],
        focusFile,
      });
    });

    expect(outcome?.track?.duration).toBe(42);
    expect(focusFile).toHaveBeenCalledWith(
      expect.objectContaining({ id: "b", duration: 42, isFavorite: true }),
    );
  });

  it("advances on track end only with autoplay, resolving from the snapshot", () => {
    const { result } = renderHook(() => useTransport());
    const [a, b, c] = [file("a"), file("b"), file("c")];
    act(() => {
      result.current.playFile([a, b, c], a, "Library");
    });

    const focusFile = vi.fn();
    let outcome: ReturnType<typeof result.current.trackEnded> | undefined;
    act(() => {
      outcome = result.current.trackEnded({ files: [file("z")], focusFile });
    });
    expect(outcome?.ok).toBe(false);
    expect(focusFile).not.toHaveBeenCalled();

    act(() => {
      result.current.setAutoplay(true);
    });
    act(() => {
      outcome = result.current.trackEnded({ files: [file("z")], focusFile });
    });
    expect(outcome?.ok).toBe(true);
    expect(focusFile).toHaveBeenCalledWith(expect.objectContaining({ id: "b" }));
  });

  it("reports the snapshot's next title without the current view", () => {
    expect(
      resolveNextTitle({ queue: [file("a"), file("b"), file("c")], cursor: 0, selectedFileId: "a" }),
    ).toBe("b");
    expect(resolveNextTitle({ queue: [file("a")], cursor: 0, selectedFileId: "a" })).toBeNull();
    expect(
      resolveNextTitle({ queue: [file("b"), file("c")], cursor: 0, selectedFileId: "b" }),
    ).toBe("c");
  });
});
