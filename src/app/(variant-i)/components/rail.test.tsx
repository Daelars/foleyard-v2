// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { V3IconRail } from "./rail";

// Area: #227. Shelf is extension-owned, so its rail tile only exists while
// sound-shelf-v2 is enabled, exactly like Auto tag.

const BASE = {
  activeView: "library" as const,
  favoritesCount: 0,
  shelfCount: 2,
  onSelectLibrary: () => {},
  onSelectFavorites: () => {},
  onSelectShelf: () => {},
  onSelectExtensions: () => {},
  onSelectOrganize: () => {},
  onOpenSettings: () => {},
};

describe("V3IconRail shelf gating", () => {
  it("hides Shelf while the extension is disabled", () => {
    render(<V3IconRail {...BASE} showShelf={false} />);
    expect(screen.queryByRole("button", { name: "Shelf" })).toBeNull();
  });

  it("shows Shelf while the extension is enabled", () => {
    render(<V3IconRail {...BASE} showShelf />);
    expect(screen.getByRole("button", { name: "Shelf" })).toBeTruthy();
  });
});
