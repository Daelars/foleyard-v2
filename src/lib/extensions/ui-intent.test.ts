import { describe, expect, it, vi } from "vitest";

import { interpretExtensionUiIntent } from "./ui-intent";

describe("interpretExtensionUiIntent", () => {
  it("opens Folder Janitor with the intent payload", () => {
    const openFolderJanitor = vi.fn();

    const handled = interpretExtensionUiIntent(
      {
        kind: "yard-ui-intent",
        type: "folder-janitor.open-scan",
        payload: { target: "folder", folderPath: "C:/sounds" },
      },
      {
        openFolderJanitor,
        openLibraryGatherer: vi.fn(),
        openMakePack: vi.fn(),
        openSettings: vi.fn(),
      },
    );

    expect(handled).toBe(true);
    expect(openFolderJanitor).toHaveBeenCalledWith({
      target: "folder",
      folderPath: "C:/sounds",
    });
  });

  it("leaves unknown intents unhandled", () => {
    expect(
      interpretExtensionUiIntent(
        { kind: "yard-ui-intent", type: "unknown", payload: null },
        {
          openFolderJanitor: vi.fn(),
          openLibraryGatherer: vi.fn(),
          openMakePack: vi.fn(),
          openSettings: vi.fn(),
        },
      ),
    ).toBe(false);
  });

  it("opens Library Gatherer", () => {
    const openLibraryGatherer = vi.fn();

    const handled = interpretExtensionUiIntent(
      {
        kind: "yard-ui-intent",
        type: "library-gatherer.open",
        payload: {},
      },
      {
        openFolderJanitor: vi.fn(),
        openLibraryGatherer,
        openMakePack: vi.fn(),
        openSettings: vi.fn(),
      },
    );

    expect(handled).toBe(true);
    expect(openLibraryGatherer).toHaveBeenCalledOnce();
  });

  it("opens Make Pack with its source and selected IDs", () => {
    const openMakePack = vi.fn();

    const handled = interpretExtensionUiIntent(
      {
        kind: "yard-ui-intent",
        type: "make-pack.open",
        payload: { source: "selection", fileIds: ["one"] },
      },
      {
        openFolderJanitor: vi.fn(),
        openLibraryGatherer: vi.fn(),
        openMakePack,
        openSettings: vi.fn(),
      },
    );

    expect(handled).toBe(true);
    expect(openMakePack).toHaveBeenCalledWith({
      source: "selection",
      fileIds: ["one"],
    });
  });

  it("opens settings for Drop Rules", () => {
    const openSettings = vi.fn();

    const handled = interpretExtensionUiIntent(
      {
        kind: "yard-ui-intent",
        type: "drop-rules.open-settings",
        payload: {},
      },
      {
        openFolderJanitor: vi.fn(),
        openLibraryGatherer: vi.fn(),
        openMakePack: vi.fn(),
        openSettings,
      },
    );

    expect(handled).toBe(true);
    expect(openSettings).toHaveBeenCalledOnce();
  });

  it("opens Folder Janitor for a library scan", () => {
    const openFolderJanitor = vi.fn();

    const handled = interpretExtensionUiIntent(
      {
        kind: "yard-ui-intent",
        type: "folder-janitor.open-scan",
        payload: { target: "library" },
      },
      {
        openFolderJanitor,
        openLibraryGatherer: vi.fn(),
        openMakePack: vi.fn(),
        openSettings: vi.fn(),
      },
    );

    expect(handled).toBe(true);
    expect(openFolderJanitor).toHaveBeenCalledWith({ target: "library" });
  });

  it("rejects a folder intent without a folder path", () => {
    const openFolderJanitor = vi.fn();

    const handled = interpretExtensionUiIntent(
      {
        kind: "yard-ui-intent",
        type: "folder-janitor.open-scan",
        payload: { target: "folder" },
      },
      {
        openFolderJanitor,
        openLibraryGatherer: vi.fn(),
        openMakePack: vi.fn(),
        openSettings: vi.fn(),
      },
    );

    expect(handled).toBe(false);
    expect(openFolderJanitor).not.toHaveBeenCalled();
  });

  it("rejects a malformed Make Pack payload", () => {
    const openMakePack = vi.fn();

    const handled = interpretExtensionUiIntent(
      {
        kind: "yard-ui-intent",
        type: "make-pack.open",
        payload: { source: "selection" },
      },
      {
        openFolderJanitor: vi.fn(),
        openLibraryGatherer: vi.fn(),
        openMakePack,
        openSettings: vi.fn(),
      },
    );

    expect(handled).toBe(false);
    expect(openMakePack).not.toHaveBeenCalled();
  });
});
