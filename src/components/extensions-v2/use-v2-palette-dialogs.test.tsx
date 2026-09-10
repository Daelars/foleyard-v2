// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useExtensionUi } from "@/app/library/use-extension-ui";
import { emptyV2UiState } from "@/lib/extensions-v2/contributions";
import { useV2PaletteBridge } from "./use-v2-palette";

// Area: v2 dialog routing. v2 scan/gather commands return values and
// plans, never UI intents, so palette invocation must open the dialogs
// that orchestrate them (janitor report, gather grants) instead of
// invoking headless. Only immediate per-item commands run headless.

const callbacks = {
  showShelf: () => {},
  openSettings: () => {},
  requestClearShelf: () => {},
  getSelectedFile: () => null,
  addToCollection: async () => {},
  addToShelf: async () => {},
  saveSearch: async () => true,
  renameCollection: async () => {},
};

describe("v2 palette dialog routing", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("opens the janitor dialog for scans and deletes, headless otherwise", () => {
    const onOpenJanitor = vi.fn();
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true, outcome: { kind: "immediate", value: {} } }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() =>
      useV2PaletteBridge([], null, emptyV2UiState(), { onOpenJanitor }),
    );

    result.current.runV2Command("folder-janitor-v2", "folder-janitor-v2.scan-library");
    result.current.runV2Command("folder-janitor-v2", "folder-janitor-v2.delete-folders");
    expect(onOpenJanitor).toHaveBeenCalledTimes(2);
    expect(fetchMock).not.toHaveBeenCalled();

    result.current.runV2Command("folder-janitor-v2", "folder-janitor-v2.remove-files");
    expect(onOpenJanitor).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("opens the gather dialog for gather commands", () => {
    const onOpenGather = vi.fn();
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true, outcome: { kind: "immediate", value: {} } }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() =>
      useV2PaletteBridge([], null, emptyV2UiState(), { onOpenGather }),
    );

    result.current.runV2Command("library-gatherer-v2", "library-gatherer-v2.preview-gather");
    result.current.runV2Command("library-gatherer-v2", "library-gatherer-v2.gather");
    expect(onOpenGather).toHaveBeenCalledTimes(2);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("stays headless without openers", () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true, outcome: { kind: "immediate", value: {} } }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() =>
      useV2PaletteBridge([], null, emptyV2UiState()),
    );

    result.current.runV2Command("folder-janitor-v2", "folder-janitor-v2.scan-library");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("extension ui v2 dialog openers", () => {
  it("opens the janitor dialog on the library target", () => {
    const { result } = renderHook(() => useExtensionUi(callbacks));
    act(() => {
      result.current.openJanitorLibrary();
    });
    expect(result.current.folderJanitorOpen).toBe(true);
    expect(result.current.folderJanitorTarget).toBe("library");
  });

  it("opens the gather dialog", () => {
    const { result } = renderHook(() => useExtensionUi(callbacks));
    expect(result.current.gatherOpen).toBe(false);
    act(() => {
      result.current.openGatherDialog();
    });
    expect(result.current.gatherOpen).toBe(true);
  });
});
