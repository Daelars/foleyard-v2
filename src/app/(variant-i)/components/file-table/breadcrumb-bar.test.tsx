// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { navigateToSegment } from "@/lib/directory-navigation";
import type { FileTableDirectory } from "@/components/FileTable/types";

import { V3BreadcrumbBar } from "./breadcrumb-bar";

// Area: the Library breadcrumb bar. The nav advertises breadcrumb semantics, so
// its segments owe the keyboard: every navigable crumb is a real, focusable
// button (the spans only looked clickable) and the current location is marked
// with aria-current instead of bold styling alone.

const ROOT: FileTableDirectory = {
  key: "root",
  label: "library",
  libraryRoot: "C:/library",
  directory: null,
  absolutePath: "C:/library",
  isRoot: true,
  showRoot: true,
};

const NESTED: FileTableDirectory = {
  key: "nested",
  label: "heavy",
  libraryRoot: "C:/library",
  directory: "rain/heavy",
  absolutePath: "C:/library/rain/heavy",
  isRoot: false,
  showRoot: true,
};

function renderBar(
  props: Partial<React.ComponentProps<typeof V3BreadcrumbBar>> = {},
) {
  const handlers = {
    onBack: vi.fn(),
    onNavigate: vi.fn(),
    onNavigateLibrary: vi.fn(),
  };
  render(
    <V3BreadcrumbBar
      currentDirectory={NESTED}
      currentCollectionName={null}
      {...handlers}
      {...props}
    />,
  );
  return handlers;
}

function crumbs() {
  return within(screen.getByRole("navigation", { name: "Breadcrumb" })).getAllByRole(
    "button",
  );
}

describe("V3BreadcrumbBar", () => {
  it("renders every segment as a focusable button", () => {
    renderBar();

    const buttons = crumbs();
    expect(buttons.map((button) => button.textContent)).toEqual([
      "Library",
      "library",
      "rain",
      "heavy",
    ]);
    // A real button is a tab stop; the previous spans were unreachable.
    expect(buttons.every((button) => button.tagName === "BUTTON")).toBe(true);
    expect(buttons.every((button) => button.tabIndex >= 0)).toBe(true);

    const target = screen.getByRole("button", { name: "rain" });
    target.focus();
    expect(document.activeElement).toBe(target);
  });

  it("marks the deepest directory as the current location", () => {
    renderBar();

    expect(
      screen.getByRole("button", { name: "heavy" }).getAttribute("aria-current"),
    ).toBe("page");
    expect(
      screen.getByRole("button", { name: "rain" }).getAttribute("aria-current"),
    ).toBeNull();
    expect(
      screen.getByRole("button", { name: "Library" }).getAttribute("aria-current"),
    ).toBeNull();
  });

  it("marks the library root current when the directory is the root", () => {
    renderBar({ currentDirectory: ROOT });

    expect(
      screen.getByRole("button", { name: "library" }).getAttribute("aria-current"),
    ).toBe("page");
    expect(
      screen.getByRole("button", { name: "Library" }).getAttribute("aria-current"),
    ).toBeNull();
  });

  it("navigates when a segment is activated", () => {
    const { onNavigate, onNavigateLibrary } = renderBar();

    fireEvent.click(screen.getByRole("button", { name: "rain" }));
    expect(onNavigate).toHaveBeenCalledWith(
      navigateToSegment(NESTED, ["rain", "heavy"], 0),
    );

    fireEvent.click(screen.getByRole("button", { name: "Library" }));
    expect(onNavigateLibrary).toHaveBeenCalledTimes(1);
  });

  it("keeps the collection as the current location and its ancestors navigable", () => {
    renderBar({ currentCollectionName: "Thunder" });

    expect(crumbs().map((button) => button.textContent)).toEqual([
      "Library",
      "library",
      "rain",
      "heavy",
    ]);
    // The collection is the current page; it is a label, not a navigation
    // target, so it carries the current-location semantics without pretending
    // to be a button.
    expect(screen.getByText("Thunder").getAttribute("aria-current")).toBe("page");
    expect(crumbs().some((button) => button.getAttribute("aria-current") === "page")).toBe(
      false,
    );
  });
});
