// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  FileTableDirectory,
  FileTableFileRecord,
} from "@/components/FileTable/types";

import { V3FileTable } from "./file-table";

// Area: app-v3 file table. The table is virtualized, which is exactly what
// breaks naive row/column relationships: most rows are not in the DOM, so the
// markup has to describe the whole list, not the mounted slice. The rows
// advertise `role="row"` and `aria-selected`, so the surrounding contract is a
// grid: a labelled grid owns a header row, a rowgroup, rows and cells whose
// counts and indexes describe the full list no matter which rows are mounted.
// Keyboard moves keep focus and selection aligned across that mount/unmount
// churn.

// The waveform is a canvas + fetch island with no bearing on a row's grid
// contract, and jsdom implements neither ResizeObserver nor canvas 2d. Keep it
// out of the row render so these tests exercise the real rows.
vi.mock("@/components/FileTable/row-waveform", () => ({
  RowWaveform: () => null,
}));

const ROW_HEIGHT = 64;
// Five rows tall: with the table's 20-row overscan only part of a long list is
// ever mounted, which is the condition these tests are about.
const VIEWPORT_HEIGHT = ROW_HEIGHT * 5;

function buildFiles(count: number): FileTableFileRecord[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `f${index}`,
    filename: `sound-${String(index).padStart(3, "0")}.wav`,
    path: `C:/library/sound-${index}.wav`,
    directory: null,
    format: "wav",
    duration: 1 + index,
    fileSize: 1024 * (index + 1),
    isFavorite: false,
    tags: [],
  }));
}

const DIRECTORY: FileTableDirectory = {
  key: "d1",
  label: "Rain",
  libraryRoot: "C:/library",
  directory: "rain",
  absolutePath: "C:/library/rain",
  isRoot: false,
  showRoot: false,
};

function fileRows(): HTMLElement[] {
  return Array.from(
    document.querySelectorAll<HTMLElement>("[role='row'][data-file-id]"),
  );
}

function fileRow(id: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-file-id="${id}"]`);
}

function renderedFileIds(): (string | undefined)[] {
  return fileRows().map((row) => row.dataset.fileId);
}

function grid(): HTMLElement {
  return screen.getByRole("grid");
}

function rowgroup(): HTMLElement {
  return screen.getByRole("rowgroup");
}

function scrollRows(offset: number) {
  const scroller = rowgroup();
  act(() => {
    scroller.scrollTop = offset;
    fireEvent.scroll(scroller);
  });
}

function Harness({
  files,
  directories = [],
  selectedFileId = null,
  onSelect,
  sortKey = "filename",
  sortDir = 1,
}: {
  files: FileTableFileRecord[];
  directories?: FileTableDirectory[];
  selectedFileId?: string | null;
  onSelect?: (file: FileTableFileRecord, index: number) => void;
  sortKey?: "filename" | "duration";
  sortDir?: 1 | -1;
}) {
  const [selected, setSelected] = useState<string | null>(selectedFileId);

  return (
    <V3FileTable
      files={files}
      directories={directories}
      currentDirectory={null}
      onNavigate={() => {}}
      selectedFileId={selected}
      onSelect={(file, index) => {
        onSelect?.(file, index);
        setSelected(file.id);
      }}
      onToggleFavorite={async () => {}}
      searchQuery=""
      isLoading={false}
      sortKey={sortKey}
      sortDir={sortDir}
      onFlipSort={() => {}}
    />
  );
}

function renderTable(props: Parameters<typeof Harness>[0]) {
  return render(<Harness {...props} />);
}

beforeEach(() => {
  // jsdom lays nothing out, so the virtualizer would measure a zero-height
  // viewport and mount one row. Report a real viewport height instead so the
  // tests see the same partial window a user does.
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(
    VIEWPORT_HEIGHT,
  );
});

describe("grid semantics", () => {
  it("labels the grid and advertises the full row and column count", () => {
    renderTable({ files: buildFiles(60) });

    const table = grid();
    expect(table.getAttribute("aria-label")).toBe("Library contents");
    // 60 files plus the header row.
    expect(table.getAttribute("aria-rowcount")).toBe("61");
    expect(table.getAttribute("aria-colcount")).toBe("5");
  });

  it("counts directories and files together and adds the desktop column", () => {
    renderTable({ files: buildFiles(2), directories: [DIRECTORY] });

    expect(grid().getAttribute("aria-rowcount")).toBe("4");
    expect(grid().getAttribute("aria-colcount")).toBe("5");
  });

  it("indexes mounted rows by their position in the whole list", () => {
    renderTable({ files: buildFiles(60) });

    const mounted = fileRows();
    // Virtualization really did omit rows: the count is honest, the DOM is not
    // the whole list.
    expect(mounted.length).toBeGreaterThan(0);
    expect(mounted.length).toBeLessThan(60);
    // The header is row 1, so the first file is row 2.
    expect(mounted[0]?.getAttribute("aria-rowindex")).toBe("2");
    expect(mounted[1]?.getAttribute("aria-rowindex")).toBe("3");

    scrollRows(ROW_HEIGHT * 50);

    // The mounted window moved with the scroll: rows from the top are gone,
    // and each row that is mounted still reports its position in the whole
    // list (index 50 is row 52 once the header is counted).
    expect(renderedFileIds()).not.toContain("f0");
    expect(fileRow("f50")?.getAttribute("aria-rowindex")).toBe("52");
    expect(fileRow("f51")?.getAttribute("aria-rowindex")).toBe("53");
  });

  it("keeps row counts and indexes coherent when more files load", () => {
    const { rerender } = renderTable({ files: buildFiles(30) });
    expect(grid().getAttribute("aria-rowcount")).toBe("31");

    rerender(<Harness files={buildFiles(90)} />);

    expect(grid().getAttribute("aria-rowcount")).toBe("91");
    expect(fileRow("f0")?.getAttribute("aria-rowindex")).toBe("2");
  });

  it("gives the header a row of column headers with column indexes", () => {
    renderTable({ files: buildFiles(10) });

    const headers = screen.getAllByRole("columnheader");
    expect(headers.map((header) => header.getAttribute("aria-colindex"))).toEqual(
      ["1", "2", "3", "4", "5"],
    );
    // The header belongs to the same grid and counts as its first row.
    expect(headers[0]?.closest("[role='row']")?.getAttribute("aria-rowindex")).toBe(
      "1",
    );
    expect(screen.getByRole("button", { name: /Name/ })).toBeTruthy();
  });

  it("exposes each row's cells with their column indexes", () => {
    renderTable({ files: buildFiles(5) });

    const row = fileRow("f0");
    expect(row).toBeTruthy();
    const cells = Array.from(row!.querySelectorAll("[role='gridcell']"));
    expect(cells.map((cell) => cell.getAttribute("aria-colindex"))).toEqual([
      "1",
      "2",
      "3",
      "4",
      "5",
    ]);
  });

  it("marks the sorted column so the header matches what it shows", () => {
    const { rerender } = renderTable({
      files: buildFiles(5),
      sortKey: "filename",
      sortDir: 1,
    });
    expect(
      screen.getByRole("columnheader", { name: /Name/ }).getAttribute("aria-sort"),
    ).toBe("ascending");

    rerender(<Harness files={buildFiles(5)} sortKey="duration" sortDir={-1} />);
    expect(
      screen.getByRole("columnheader", { name: /Name/ }).getAttribute("aria-sort"),
    ).toBeNull();
    expect(
      screen.getByRole("columnheader", { name: /Time/ }).getAttribute("aria-sort"),
    ).toBe("descending");
  });

  it("keeps a folder row in the grid with its own row index", () => {
    renderTable({ files: buildFiles(3), directories: [DIRECTORY] });

    const folder = screen.getByRole("button", { name: "Open folder Rain" });
    const row = folder.closest("[role='row']");
    expect(row).toBeTruthy();
    expect(row?.getAttribute("aria-rowindex")).toBe("2");
    expect(row?.querySelector("[role='gridcell']")).toBeTruthy();
  });
});

describe("keyboard navigation across virtualization", () => {
  it("moves focus and selection to the next mounted row", () => {
    renderTable({ files: buildFiles(60), selectedFileId: "f0" });

    const first = fileRow("f0");
    expect(first).toBeTruthy();
    first!.focus();

    fireEvent.keyDown(first!, { key: "j" });

    expect(document.activeElement).toBe(fileRow("f1"));
    expect(fileRow("f1")?.getAttribute("aria-selected")).toBe("true");
  });

  it("focuses the row the keyboard moved to once virtualization mounts it", () => {
    renderTable({ files: buildFiles(60), selectedFileId: "f0" });

    // Scroll far enough that the selection and its neighbour are both
    // unmounted: the keyboard move has to survive a scroll-driven range change.
    scrollRows(ROW_HEIGHT * 50);
    expect(fileRow("f1")).toBeNull();

    fireEvent.keyDown(grid(), { key: "j" });

    // jsdom implements no Element.scrollTo, so the virtualizer's scroll request
    // cannot move the viewport on its own: stand in for the browser applying
    // that scroll. The row then mounts, and focus has to follow it there
    // instead of being dropped on <body>.
    scrollRows(ROW_HEIGHT);

    expect(fileRow("f1")).toBeTruthy();
    expect(document.activeElement).toBe(fileRow("f1"));
    expect(fileRow("f1")?.getAttribute("aria-selected")).toBe("true");
  });

  it("keeps focus inside the grid when the focused row is unmounted", () => {
    renderTable({ files: buildFiles(60), selectedFileId: "f0" });

    const first = fileRow("f0");
    first!.focus();
    expect(document.activeElement).toBe(first);

    scrollRows(ROW_HEIGHT * 50);

    expect(fileRow("f0")).toBeNull();
    // Focus is not silently dropped on <body>; it lands on the grid, where the
    // keyboard contract still applies.
    expect(document.activeElement).toBe(grid());

    fireEvent.keyDown(grid(), { key: "k" });

    expect(document.activeElement).toBe(fileRow("f59"));
    expect(fileRow("f59")?.getAttribute("aria-selected")).toBe("true");
  });

  it("keeps focus inside the grid when a folder row is unmounted", () => {
    renderTable({ files: buildFiles(60), directories: [DIRECTORY] });

    const openFolder = screen.getByRole("button", { name: "Open folder Rain" });
    openFolder.focus();
    expect(document.activeElement).toBe(openFolder);

    scrollRows(ROW_HEIGHT * 40);

    expect(
      screen.queryByRole("button", { name: "Open folder Rain" }),
    ).toBeNull();
    expect(document.activeElement).toBe(grid());
  });

  it("selects the current row with Enter or Space from the grid itself", () => {
    const onSelect = vi.fn();
    renderTable({ files: buildFiles(20), selectedFileId: "f3", onSelect });

    fireEvent.keyDown(grid(), { key: "Enter" });
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect.mock.calls[0]?.[0]).toMatchObject({ id: "f3" });

    fireEvent.keyDown(grid(), { key: " " });
    expect(onSelect).toHaveBeenCalledTimes(2);
  });
});
