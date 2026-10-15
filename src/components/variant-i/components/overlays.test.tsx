// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { Button, Dialog, DialogFooter, DialogTitle, Select } from "@/components/variant-i";

// Area: the Dialog modal contract. The library renders `role="alertdialog"`
// with `aria-modal="true"`, so it owes what that advertises: opening moves
// focus to an intentional target inside the surface, Tab/Shift+Tab stay
// inside it, the background is inert to pointer and keyboard, Escape
// dismisses (when the surface permits it) and focus returns to the control
// that opened the surface.

function focusedText(): string | null {
  return document.activeElement?.textContent?.trim() ?? null;
}

function DialogHarness({ closeOnEscape = true }: { closeOnEscape?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <main data-testid="background">
        <button type="button" data-testid="workspace-action">
          Workspace action
        </button>
      </main>
      <button type="button" onClick={() => setOpen(true)}>
        Remove scan root
      </button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        labelledBy="dialog-title"
        describedBy="dialog-desc"
        closeOnEscape={closeOnEscape}
      >
        <DialogTitle id="dialog-title">Remove scan root?</DialogTitle>
        <p id="dialog-desc">The folder stays on disk.</p>
        <DialogFooter>
          <Button tone="secondary" size="sm" type="button" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button tone="danger" size="sm" type="button" disabled>
            Delete forever
          </Button>
          <Button tone="primary" size="sm" type="button">
            Remove
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}

function openDialog(closeOnEscape = true) {
  render(<DialogHarness closeOnEscape={closeOnEscape} />);
  const trigger = screen.getByRole("button", { name: "Remove scan root" });
  // A real click presses first; the hook remembers that control as the
  // invoker even where the platform does not focus it on click.
  fireEvent.pointerDown(trigger);
  fireEvent.click(trigger);
  return { dialog: screen.getByRole("alertdialog"), trigger };
}

describe("Dialog modal contract", () => {
  it("moves focus to the first focusable control when it opens", () => {
    openDialog();
    expect(focusedText()).toBe("Cancel");
  });

  it("traps Tab and Shift+Tab inside the surface, skipping disabled controls", () => {
    openDialog();
    const cancel = screen.getByRole("button", { name: "Cancel" });
    const remove = screen.getByRole("button", { name: "Remove" });

    remove.focus();
    fireEvent.keyDown(remove, { key: "Tab" });
    expect(document.activeElement).toBe(cancel);

    fireEvent.keyDown(cancel, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(remove);
    expect(focusedText()).not.toBe("Delete forever");
  });

  it("marks the background inert while open and restores it on close", () => {
    const { dialog } = openDialog();
    const background = screen.getByTestId("background");
    expect(background.hasAttribute("inert")).toBe(true);
    expect(background.getAttribute("aria-hidden")).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(dialog.isConnected).toBe(false);
    expect(background.hasAttribute("inert")).toBe(false);
    expect(background.getAttribute("aria-hidden")).toBeNull();
  });

  it("returns focus to the control that opened it on close", () => {
    const { trigger } = openDialog();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("dismisses on Escape and returns focus to the invoking control", () => {
    const { trigger } = openDialog();

    fireEvent.keyDown(document.activeElement as Element, { key: "Escape" });

    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("refuses Escape when the surface forbids dismissal", () => {
    openDialog(false);

    fireEvent.keyDown(document.activeElement as Element, { key: "Escape" });

    expect(screen.getByRole("alertdialog")).toBeTruthy();
  });

  it("leaves Escape alone when a nested popup has already consumed it", () => {
    const onClose = vi.fn();
    render(
      <Dialog open onClose={onClose} labelledBy="t" describedBy="d">
        <DialogTitle id="t">Enable cleanup actions?</DialogTitle>
        <p onKeyDown={(event) => event.preventDefault()}>This cannot be undone.</p>
        <DialogFooter>
          <Button tone="danger" size="sm" type="button">
            Enable
          </Button>
        </DialogFooter>
      </Dialog>,
    );

    fireEvent.keyDown(screen.getByText("This cannot be undone."), { key: "Escape" });

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("alertdialog")).toBeTruthy();
  });

  it("keeps backdrop click dismissal", () => {
    const onClose = vi.fn();
    render(
      <Dialog open onClose={onClose} labelledBy="t" describedBy="d">
        <DialogTitle id="t">Remove scan root?</DialogTitle>
      </Dialog>,
    );
    fireEvent.click(screen.getByRole("alertdialog").parentElement!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("lets a nested popup consume Escape before the dialog", () => {
    const onClose = vi.fn();
    render(
      <Dialog open onClose={onClose} labelledBy="t" describedBy="d">
        <DialogTitle id="t">Appearance</DialogTitle>
        <Select
          label="Density"
          value="compact"
          options={[
            { value: "compact", label: "Compact" },
            { value: "roomy", label: "Roomy" },
          ]}
        />
      </Dialog>,
    );

    const trigger = screen.getByRole("button", { name: "Density" });
    fireEvent.click(trigger);
    const listbox = screen.getByRole("listbox", { name: "Density" });

    fireEvent.keyDown(listbox, { key: "Escape" });

    expect(screen.queryByRole("listbox", { name: "Density" })).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    expect(document.activeElement).toBe(trigger);
  });
});

describe("nested Dialog surfaces", () => {
  it("only the innermost surface answers Escape", () => {
    const onOuterClose = vi.fn();
    const onInnerClose = vi.fn();

    render(
      <Dialog open onClose={onOuterClose} labelledBy="outer-title" describedBy="outer-desc">
        <DialogTitle id="outer-title">Folder Janitor</DialogTitle>
        <p id="outer-desc">Find duplicates and broken files.</p>
        <Dialog
          open
          onClose={onInnerClose}
          labelledBy="inner-title"
          describedBy="inner-desc"
        >
          <DialogTitle id="inner-title">Enable cleanup actions?</DialogTitle>
          <p id="inner-desc">This lets you remove files.</p>
          <DialogFooter>
            <Button tone="secondary" size="sm" type="button">
              Cancel
            </Button>
          </DialogFooter>
        </Dialog>
      </Dialog>,
    );

    fireEvent.keyDown(document.activeElement as Element, { key: "Escape" });

    expect(onInnerClose).toHaveBeenCalledTimes(1);
    expect(onOuterClose).not.toHaveBeenCalled();
  });

  it("keeps the inner surface's controls live while the outer content is inert", () => {
    render(
      <Dialog open onClose={() => {}} labelledBy="outer-title" describedBy="outer-desc">
        <DialogTitle id="outer-title">Folder Janitor</DialogTitle>
        <p id="outer-desc">Find duplicates and broken files.</p>
        <Dialog open onClose={() => {}} labelledBy="inner-title" describedBy="inner-desc">
          <DialogTitle id="inner-title">Enable cleanup actions?</DialogTitle>
          <button type="button">Enable</button>
        </Dialog>
      </Dialog>,
    );

    const inner = screen.getByRole("alertdialog", { name: "Enable cleanup actions?" });
    expect(inner.hasAttribute("inert")).toBe(false);
    expect(inner.getAttribute("aria-hidden")).toBeNull();
    const outerTitle = screen.getByText("Folder Janitor");
    expect(outerTitle.closest("[inert]")).toBeTruthy();
  });
});
