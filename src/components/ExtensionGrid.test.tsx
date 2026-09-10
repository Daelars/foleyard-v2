// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ExtensionGrid } from "./ExtensionGrid";
import { ExtensionGrid as WorkspaceExtensionGrid } from "./workspace/ExtensionGrid";

// Area: tools grid trailing v2 cards. The v1 registry is fully retired so
// the v1 list is permanently empty; the grid must keep rendering trailing
// v2 cards instead of collapsing to the empty state and dropping them.
const grids = {
  "app grid": ExtensionGrid,
  "workspace grid": WorkspaceExtensionGrid,
} as const;

describe.each(Object.entries(grids))("extension grid (%s)", (_label, Grid) => {
  it("renders trailing v2 cards when the v1 list is empty", () => {
    render(
      <Grid
        extensions={[]}
        trailing={<div data-testid="v2-cards">v2 cards</div>}
        trailingCount={7}
      />,
    );
    expect(screen.getByTestId("v2-cards")).toBeTruthy();
    expect(screen.queryByText("No extensions registered")).toBeNull();
  });

  it("shows the empty state only when both generations are empty", () => {
    const { rerender } = render(<Grid extensions={[]} trailingCount={0} />);
    expect(screen.getByText("No extensions registered")).toBeTruthy();

    rerender(
      <Grid
        extensions={[]}
        trailing={<div data-testid="v2-cards">v2 cards</div>}
        trailingCount={0}
      />,
    );
    // Defensive: trailing still mounts even when the count lags the entries.
    expect(screen.getByTestId("v2-cards")).toBeTruthy();
  });
});
