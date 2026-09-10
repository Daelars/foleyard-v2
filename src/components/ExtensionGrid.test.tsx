// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ExtensionGrid } from "./ExtensionGrid";

// Area: tools grid trailing v2 cards. The v1 registry is fully retired so
// the v1 list is permanently empty; the grid must keep rendering trailing
// v2 cards instead of collapsing to the empty state and dropping them.
describe("extension grid", () => {
  it("renders trailing v2 cards when the v1 list is empty", () => {
    render(
      <ExtensionGrid
        extensions={[]}
        trailing={<div data-testid="v2-cards">v2 cards</div>}
        trailingCount={7}
      />,
    );
    expect(screen.getByTestId("v2-cards")).toBeTruthy();
    expect(screen.queryByText("No extensions registered")).toBeNull();
  });

  it("shows the empty state only when both generations are empty", () => {
    const { rerender } = render(<ExtensionGrid extensions={[]} trailingCount={0} />);
    expect(screen.getByText("No extensions registered")).toBeTruthy();

    rerender(
      <ExtensionGrid
        extensions={[]}
        trailing={<div data-testid="v2-cards">v2 cards</div>}
        trailingCount={0}
      />,
    );
    // Defensive: trailing still mounts even when the count lags the entries.
    expect(screen.getByTestId("v2-cards")).toBeTruthy();
  });
});
