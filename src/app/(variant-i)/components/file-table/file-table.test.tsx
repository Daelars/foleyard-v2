// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { FileTableProps } from "@/components/FileTable/types";

import { V3FileTable } from "./file-table";
import { V3LoadFailure } from "./load-failure";

// Area: #276. A failed view load presents an inline failure and retry state
// instead of the empty state, and a same-view reload failure keeps its
// (still current) rows visible under a retry banner.

function tableProps(overrides: Partial<FileTableProps> = {}): FileTableProps {
  return {
    files: [],
    directories: [],
    currentDirectory: null,
    onNavigate: () => {},
    selectedFileId: null,
    onSelect: () => {},
    onToggleFavorite: async () => {},
    searchQuery: "",
    isLoading: false,
    sortKey: "filename",
    sortDir: 1,
    onFlipSort: () => {},
    ...overrides,
  };
}

describe("V3LoadFailure", () => {
  it("announces the failure and retries on demand in place of rows", () => {
    const onRetry = vi.fn();
    render(<V3LoadFailure message="Failed to load library" onRetry={onRetry} />);
    expect(screen.getByRole("alert").textContent).toContain("Failed to load library");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("renders the inline banner variant with a retry", () => {
    const onRetry = vi.fn();
    render(
      <V3LoadFailure
        variant="inline"
        message="Failed to load shelf"
        onRetry={onRetry}
      />,
    );
    expect(screen.getByRole("alert").textContent).toContain("Failed to load shelf");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

describe("V3FileTable failed load", () => {
  it("shows the inline failure and retry instead of the empty state", () => {
    const onRetry = vi.fn();
    render(
      <V3FileTable
        {...tableProps({ error: "Failed to load library", onRetry })}
      />,
    );
    expect(screen.getByRole("alert").textContent).toContain("Failed to load library");
    expect(screen.queryByText("Nothing here yet.")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("falls back to the empty state when there is no failure", () => {
    render(<V3FileTable {...tableProps()} />);
    expect(screen.queryByText("Nothing here yet.")).not.toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
