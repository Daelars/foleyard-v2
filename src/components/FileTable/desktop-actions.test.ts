import { afterEach, describe, expect, it, vi } from "vitest";

import {
  mockUseCallback,
  mockUseEffect,
  mockUseMemo,
  mockUseRef,
  mockUseState,
  mockUseSyncExternalStore,
  resetHookCursor,
  resetHookSlots,
} from "./hook-harness";
import type { FileTableFileRecord } from "./types";

vi.mock("react", async (importOriginal) => {
  const original = await importOriginal<typeof import("react")>();
  return {
    ...original,
    useState: mockUseState,
    useMemo: mockUseMemo,
    useCallback: mockUseCallback,
    useRef: mockUseRef,
    useEffect: mockUseEffect,
    useSyncExternalStore: mockUseSyncExternalStore,
  };
});

vi.mock("sonner", () => ({
  toast: { error: () => {}, success: () => {} },
}));

const { useFileTableDesktopActions } = await import("./desktop-actions");

function makeFile(id: string): FileTableFileRecord {
  return {
    id,
    filename: `${id}.wav`,
    path: `/library/${id}.wav`,
    directory: null,
    format: "wav",
    duration: 1,
    fileSize: 100,
    isFavorite: false,
    tags: [],
  };
}

afterEach(() => {
  (globalThis as unknown as { window?: unknown }).window = undefined;
});

describe("useFileTableDesktopActions stability", () => {
  it("returns referentially stable callbacks across renders with unchanged inputs", () => {
    resetHookSlots();
    const onSelect = () => {};
    const selectedIds = ["a"];

    const first = useFileTableDesktopActions(onSelect, selectedIds);
    resetHookCursor();
    const second = useFileTableDesktopActions(onSelect, selectedIds);

    expect(second).toBe(first);
    expect(second.handleCopyPath).toBe(first.handleCopyPath);
    expect(second.handleDragEnd).toBe(first.handleDragEnd);
    expect(second.handleNativeDragStart).toBe(first.handleNativeDragStart);
    expect(second.handleOpenFile).toBe(first.handleOpenFile);
    expect(second.handleRevealInExplorer).toBe(first.handleRevealInExplorer);
  });

  it("keeps unrelated callbacks stable when the selection identity changes", () => {
    resetHookSlots();
    const onSelect = () => {};

    const first = useFileTableDesktopActions(onSelect, ["a"]);
    resetHookCursor();
    const second = useFileTableDesktopActions(onSelect, ["a", "b"]);

    expect(second.handleNativeDragStart).not.toBe(first.handleNativeDragStart);
    expect(second.handleCopyPath).toBe(first.handleCopyPath);
    expect(second.handleDragEnd).toBe(first.handleDragEnd);
    expect(second.handleOpenFile).toBe(first.handleOpenFile);
    expect(second.handleRevealInExplorer).toBe(first.handleRevealInExplorer);
  });

  it("stays stable when the desktop bridge is present", () => {
    (globalThis as unknown as { window?: unknown }).window = {
      desktopBridge: { isDesktop: true },
    };
    resetHookSlots();
    const onSelect = () => {};
    const selectedIds = ["a"];

    const first = useFileTableDesktopActions(onSelect, selectedIds);
    expect(first.desktop).toBe(true);
    resetHookCursor();
    const second = useFileTableDesktopActions(onSelect, selectedIds);

    expect(second).toBe(first);
  });

  it("handles the web clipboard fallback without a desktop bridge", async () => {
    resetHookSlots();
    const actions = useFileTableDesktopActions(() => {}, []);

    // No window/navigator in this environment: the fallback rejects and the
    // handler reports instead of throwing.
    await expect(actions.handleCopyPath(makeFile("a"))).resolves.toBeUndefined();
  });
});
