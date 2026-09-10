// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { V3SelectionBulkBar } from "./bulk-bar";

// Area: app-v3 adapter wiring. The bulk bar maps the app's staged removal
// contract (choose → confirm+choice → execute) onto the library BulkBar
// stage machine, keeping the two distinct operations (choose, confirm)
// wired to the real handlers.

const BASE = {
  count: 3,
  tags: [{ id: "t1", name: "rain", color: "#5ad1e6" }],
  soundShelfEnabled: true,
  onSaveAll: () => {},
  onAddToQueue: () => {},
  onAddToShelf: () => {},
  onTag: () => {},
  onRemove: () => {},
  bulkRemove: null as
    | { stage: "choose" }
    | { stage: "confirm"; choice: "library" | "disk" }
    | null,
  removeDefault: "library" as "library" | "disk",
  onChooseRemove: () => {},
  onConfirmRemove: () => {},
  onCancelRemove: () => {},
  onClear: () => {},
};

describe("V3SelectionBulkBar", () => {
  it("maps Remove to the app choose stage", () => {
    const onRemove = vi.fn();
    render(<V3SelectionBulkBar {...BASE} onRemove={onRemove} />);
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it("maps the library/disk choice to onChooseRemove", () => {
    const onChooseRemove = vi.fn();
    render(
      <V3SelectionBulkBar
        {...BASE}
        bulkRemove={{ stage: "choose" }}
        onChooseRemove={onChooseRemove}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /From disk/ }));
    expect(onChooseRemove).toHaveBeenCalledWith("disk");
  });

  it("maps Sure? to onConfirmRemove and X to onCancelRemove", () => {
    const onConfirmRemove = vi.fn();
    const onCancelRemove = vi.fn();
    const { rerender } = render(
      <V3SelectionBulkBar
        {...BASE}
        bulkRemove={{ stage: "confirm", choice: "library" }}
        onConfirmRemove={onConfirmRemove}
        onCancelRemove={onCancelRemove}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Sure?" }));
    expect(onConfirmRemove).toHaveBeenCalledTimes(1);
    rerender(
      <V3SelectionBulkBar
        {...BASE}
        bulkRemove={{ stage: "confirm", choice: "disk" }}
        onConfirmRemove={onConfirmRemove}
        onCancelRemove={onCancelRemove}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Cancel remove" }));
    expect(onCancelRemove).toHaveBeenCalledTimes(1);
  });

  it("hides the shelf action when the extension is off", () => {
    render(
      <V3SelectionBulkBar {...BASE} soundShelfEnabled={false} />,
    );
    expect(screen.queryByRole("button", { name: "Add to Shelf" })).toBeNull();
  });

  it("opens the tag dropdown and applies a tag", () => {
    const onTag = vi.fn();
    render(<V3SelectionBulkBar {...BASE} onTag={onTag} />);
    fireEvent.click(screen.getByRole("button", { name: "Tag" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /rain/ }));
    expect(onTag).toHaveBeenCalledWith("t1");
  });
});