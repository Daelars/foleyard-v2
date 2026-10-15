// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { useRef, useState } from "react";
import { beforeAll, describe, expect, it } from "vitest";

import type { PaletteEntry } from "@/components/CommandPalette/command-palette";

import { V3CommandPalette } from "./palette";

// Area: the command palette modal contract. The app palette is the same
// blocking surface as a dialog: it announces `role="dialog"` +
// `aria-modal="true"`, so opening must move focus to the query, Tab must stay
// inside the panel, the workspace behind it must be inert, Escape must
// dismiss, and focus must return to the control that opened it.

const ENTRIES: PaletteEntry[] = [
  { id: "view:library", label: "Go to Library", section: "view", hint: "" },
  { id: "view:favorites", label: "Go to Favorites", section: "view", hint: "" },
];

function PaletteHarness() {
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div>
      <main data-testid="background">
        <button type="button" data-testid="workspace-action">
          Workspace action
        </button>
      </main>
      <button type="button" onClick={() => setOpen(true)}>
        Open palette
      </button>
      <V3CommandPalette
        open={open}
        query=""
        entries={ENTRIES}
        activeIndex={0}
        inputRef={inputRef}
        onQueryChange={() => {}}
        onHoverEntry={() => {}}
        onSelectEntry={() => {}}
        onClose={() => setOpen(false)}
      />
    </div>
  );
}

function openPalette() {
  render(<PaletteHarness />);
  const trigger = screen.getByRole("button", { name: "Open palette" });
  fireEvent.pointerDown(trigger);
  fireEvent.click(trigger);
  return { dialog: screen.getByRole("dialog"), trigger };
}

beforeAll(() => {
  // jsdom has no layout: the palette scrolls its active row into view.
  Element.prototype.scrollIntoView = () => {};
});

describe("command palette modal contract", () => {
  it("announces itself as a modal dialog", () => {
    const { dialog } = openPalette();
    expect(dialog.getAttribute("aria-modal")).toBe("true");
  });

  it("moves focus to the query input on open", () => {
    openPalette();
    expect(document.activeElement).toBe(
      screen.getByRole("textbox", { name: "Type a command or sound" }),
    );
  });

  it("traps Tab and Shift+Tab inside the panel", () => {
    openPalette();
    const query = screen.getByRole("textbox", { name: "Type a command or sound" });
    const last = screen.getByRole("option", { name: "Go to Favorites" });

    fireEvent.keyDown(query, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);

    fireEvent.keyDown(last, { key: "Tab" });
    expect(document.activeElement).toBe(query);
  });

  it("makes the workspace inert while open and restores it on close", () => {
    openPalette();
    const background = screen.getByTestId("background");
    expect(background.hasAttribute("inert")).toBe(true);
    expect(background.getAttribute("aria-hidden")).toBe("true");

    fireEvent.keyDown(document.activeElement as Element, { key: "Escape" });

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(background.hasAttribute("inert")).toBe(false);
    expect(background.getAttribute("aria-hidden")).toBeNull();
  });

  it("dismisses on Escape and returns focus to the invoking control", () => {
    const { trigger } = openPalette();

    fireEvent.keyDown(document.activeElement as Element, { key: "Escape" });

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
});
