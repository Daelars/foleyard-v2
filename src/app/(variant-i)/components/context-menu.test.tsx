// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { useRef, useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { MenuItem, MenuSeparator } from "@/components/variant-i";
import type { FileTableDirectory, FileTableFileRecord } from "@/components/FileTable/types";

import { RowContextMenu, isContextMenuKey, type RowMenuState } from "./context-menu";
import { V3DirectoryRow } from "./file-table/directory-row";
import { V3FileRow } from "./file-table/file-row";

// The waveform is a canvas + fetch island with no bearing on a row's keyboard
// contract, and jsdom implements neither ResizeObserver nor canvas 2d. Keep it
// out of the row render so these tests exercise the real row element.
vi.mock("@/components/FileTable/row-waveform", () => ({
  RowWaveform: () => null,
}));

// Area: app-v3 context menus. The menu advertises `role="menu"` and
// `role="menuitem"` rows, so it owes the keyboard contract those roles
// promise: focus moves into the menu on open, roves over the enabled items
// (wrapping, skipping disabled ones) with the arrow/Home/End keys plus
// typeahead, Escape and Tab close it, and focus returns to the row it opened
// from. Rows open their menu from the keyboard (Menu key / Shift+F10) and the
// menu is anchored to the row rather than the viewport origin.

const MENU_TRIGGER = "Open row menu";

function MenuHarness({ keyboard = false }: { keyboard?: boolean }) {
  const [state, setState] = useState<RowMenuState<string>>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  return (
    <div>
      <button
        ref={triggerRef}
        type="button"
        data-testid="trigger"
        onClick={() =>
          setState({
            item: "rain.wav",
            x: 4,
            y: 8,
            anchor: triggerRef.current,
            keyboard,
          })
        }
      >
        {MENU_TRIGGER}
      </button>
      <RowContextMenu
        state={state}
        onClose={() => setState(null)}
        label="Row actions"
      >
        <MenuItem onClick={() => {}}>Copy path</MenuItem>
        <MenuSeparator />
        <MenuItem disabled>No tags yet</MenuItem>
        <MenuItem onClick={() => {}}>Remove from library</MenuItem>
      </RowContextMenu>
    </div>
  );
}

function openMenu(keyboard = false) {
  render(<MenuHarness keyboard={keyboard} />);
  fireEvent.click(screen.getByRole("button", { name: MENU_TRIGGER }));
}

function focusedItemName() {
  return document.activeElement?.textContent?.trim() ?? null;
}

describe("RowContextMenu keyboard contract", () => {
  it("moves focus to the first enabled item when it opens", () => {
    openMenu();
    expect(screen.getByRole("menu")).toBeTruthy();
    expect(focusedItemName()).toBe("Copy path");
  });

  it("roves over enabled items, wrapping and skipping disabled ones", () => {
    openMenu();
    const menu = screen.getByRole("menu");

    fireEvent.keyDown(menu, { key: "ArrowDown" });
    expect(focusedItemName()).toBe("Remove from library");

    fireEvent.keyDown(menu, { key: "ArrowDown" });
    expect(focusedItemName()).toBe("Copy path");

    fireEvent.keyDown(menu, { key: "ArrowUp" });
    expect(focusedItemName()).toBe("Remove from library");

    fireEvent.keyDown(menu, { key: "Home" });
    expect(focusedItemName()).toBe("Copy path");

    fireEvent.keyDown(menu, { key: "End" });
    expect(focusedItemName()).toBe("Remove from library");
  });

  it("never focuses a disabled item", () => {
    openMenu();
    const menu = screen.getByRole("menu");
    for (const key of ["ArrowDown", "ArrowUp", "Home", "End"]) {
      fireEvent.keyDown(menu, { key });
      expect(focusedItemName()).not.toBe("No tags yet");
    }
  });

  it("jumps to the next item matching the typed letters", () => {
    openMenu();
    fireEvent.keyDown(screen.getByRole("menu"), { key: "r" });
    expect(focusedItemName()).toBe("Remove from library");
  });

  it("closes on Escape and returns focus to the row that opened it", () => {
    openMenu();
    const trigger = screen.getByRole("button", { name: MENU_TRIGGER });

    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });

    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("closes on Tab without keeping focus", () => {
    openMenu();
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Tab" });
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("keeps click activation working", () => {
    const onClick = vi.fn();
    render(
      <MenuItemHarness onClick={onClick} />,
    );
    fireEvent.click(screen.getByRole("button", { name: MENU_TRIGGER }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Copy path" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("anchors a keyboard-invoked menu to the row, not the viewport origin", () => {
    render(<MenuHarness keyboard />);
    const trigger = screen.getByTestId("trigger");
    // jsdom reports a zero rect on its own, so a menu that ignored the anchor
    // would sit at the viewport origin instead of under the row.
    vi.spyOn(trigger, "getBoundingClientRect").mockReturnValue({
      x: 40,
      y: 100,
      top: 100,
      left: 40,
      right: 160,
      bottom: 140,
      width: 120,
      height: 40,
      toJSON: () => ({}),
    } as DOMRect);

    fireEvent.click(trigger);

    const menu = screen.getByRole("menu") as HTMLElement;
    expect(menu.style.left).toBe("40px");
    expect(menu.style.top).toBe("144px");
    expect(document.activeElement?.textContent?.trim()).toBe("Copy path");
  });
});

function MenuItemHarness({ onClick }: { onClick: () => void }) {
  const [state, setState] = useState<RowMenuState<string>>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  return (
    <div>
      <button
        ref={triggerRef}
        type="button"
        onClick={() =>
          setState({
            item: "rain.wav",
            x: 4,
            y: 8,
            anchor: triggerRef.current,
            keyboard: false,
          })
        }
      >
        {MENU_TRIGGER}
      </button>
      <RowContextMenu
        state={state}
        onClose={() => setState(null)}
        label="Row actions"
      >
        <MenuItem onClick={onClick}>Copy path</MenuItem>
      </RowContextMenu>
    </div>
  );
}

const FILE: FileTableFileRecord = {
  id: "f1",
  filename: "rain.wav",
  path: "C:/library/rain.wav",
  directory: null,
  format: "wav",
  duration: 3.2,
  fileSize: 1024,
  isFavorite: false,
  tags: [],
};

const DIRECTORY: FileTableDirectory = {
  key: "d1",
  label: "Rain",
  libraryRoot: "C:/library",
  directory: "rain",
  absolutePath: "C:/library/rain",
  isRoot: false,
  showRoot: false,
};

describe("isContextMenuKey", () => {
  it("recognises the Menu key and Shift+F10 only", () => {
    expect(isContextMenuKey({ key: "ContextMenu", shiftKey: false })).toBe(true);
    expect(isContextMenuKey({ key: "F10", shiftKey: true })).toBe(true);
    expect(isContextMenuKey({ key: "F10", shiftKey: false })).toBe(false);
    expect(isContextMenuKey({ key: "Enter", shiftKey: true })).toBe(false);
  });
});

describe("row context-menu keyboard invocation", () => {
  it("opens a file row's menu from the keyboard, anchored to the row", () => {
    const onContextMenu = vi.fn();
    const { container } = render(
      <V3FileRow
        desktop={false}
        file={FILE}
        isDragging={false}
        isSelected={false}
        isSelectedFilePlaying={false}
        onSelect={() => {}}
        onToggleFavorite={async () => {}}
        searchQuery=""
        showDesktopActions={false}
        handleDragEnd={() => {}}
        handleNativeDragStart={() => {}}
        onContextMenu={onContextMenu}
        virtualIndex={0}
        start={0}
      />,
    );
    const row = container.querySelector<HTMLElement>("[data-file-id]");
    expect(row).toBeTruthy();

    fireEvent.keyDown(row!, { key: "F10", shiftKey: true });

    expect(onContextMenu).toHaveBeenCalledTimes(1);
    const [target] = onContextMenu.mock.calls[0]!;
    expect(target.keyboard).toBe(true);
    expect(target.anchor).toBe(row);

    onContextMenu.mockClear();
    fireEvent.keyDown(row!, { key: "ContextMenu" });
    expect(onContextMenu).toHaveBeenCalledTimes(1);
    expect(onContextMenu.mock.calls[0]![0].keyboard).toBe(true);

    onContextMenu.mockClear();
    fireEvent.keyDown(row!, { key: "F10" });
    expect(onContextMenu).not.toHaveBeenCalled();
  });

  it("treats a coordinate-less contextmenu event as keyboard-invoked", () => {
    const onContextMenu = vi.fn();
    const { container } = render(
      <V3FileRow
        desktop={false}
        file={FILE}
        isDragging={false}
        isSelected={false}
        isSelectedFilePlaying={false}
        onSelect={() => {}}
        onToggleFavorite={async () => {}}
        searchQuery=""
        showDesktopActions={false}
        handleDragEnd={() => {}}
        handleNativeDragStart={() => {}}
        onContextMenu={onContextMenu}
        virtualIndex={0}
        start={0}
      />,
    );
    const row = container.querySelector<HTMLElement>("[data-file-id]")!;

    // Browsers also fire `contextmenu` for Shift+F10, without coordinates.
    fireEvent.contextMenu(row);
    expect(onContextMenu.mock.calls[0]![0].keyboard).toBe(true);

    onContextMenu.mockClear();
    fireEvent.contextMenu(row, { clientX: 120, clientY: 240 });
    expect(onContextMenu.mock.calls[0]![0]).toMatchObject({
      keyboard: false,
      x: 120,
      y: 240,
    });
  });

  it("opens a directory row's menu from the keyboard, anchored to the row", () => {
    const onContextMenu = vi.fn();
    render(
      <V3DirectoryRow
        dir={DIRECTORY}
        start={0}
        virtualIndex={0}
        onNavigate={() => {}}
        onContextMenu={onContextMenu}
      />,
    );
    // A folder opens through the button that carries the row's action; it now
    // sits inside the row's label cell rather than being the row itself.
    const openFolder = screen.getByRole("button", { name: "Open folder Rain" });
    expect(openFolder.closest("[role='row']")).toBeTruthy();

    fireEvent.keyDown(openFolder, { key: "ContextMenu" });

    expect(onContextMenu).toHaveBeenCalledTimes(1);
    const [target] = onContextMenu.mock.calls[0]!;
    expect(target.keyboard).toBe(true);
    expect(target.anchor).toBe(openFolder);
  });
});
