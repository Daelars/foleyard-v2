// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  CommandItem,
  PendingButton,
  SettingRow,
  SoundTag,
  StatusBadge,
} from "./foleyard";

// Area: component library. Pending actions gate while busy so a second
// click cannot double-submit; setting rows name their switches; tags keep
// their literal name with provenance; command rows carry the parent's
// listbox semantics through the extraction.
describe("PendingButton", () => {
  it("runs the action when idle and blocks repeat clicks while pending", () => {
    const onClick = vi.fn();
    const { rerender } = render(
      <PendingButton onClick={onClick}>Start Full Scan</PendingButton>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Start Full Scan" }));
    expect(onClick).toHaveBeenCalledTimes(1);

    rerender(
      <PendingButton onClick={onClick} pending pendingText="Scanning...">
        Start Full Scan
      </PendingButton>,
    );
    const pending = screen.getByRole("button", { name: "Scanning..." });
    expect((pending as HTMLButtonElement).disabled).toBe(true);
    expect(pending.getAttribute("aria-busy")).toBe("true");
    fireEvent.click(pending);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe("SettingRow", () => {
  it("names its switch from the row label", () => {
    const onCheckedChange = vi.fn();
    render(
      <SettingRow
        label="Auto-tag new files"
        description="Run filename rules after each scan."
        checked={false}
        onCheckedChange={onCheckedChange}
      />,
    );
    fireEvent.click(
      screen.getByRole("switch", { name: "Auto-tag new files" }),
    );
    expect(onCheckedChange.mock.calls[0]?.[0]).toBe(true);
  });
});

describe("SoundTag", () => {
  it("keeps the literal name with provenance and confidence", () => {
    const { container } = render(
      <SoundTag name="thunder" provenance="semantic_ai" confidence={0.92} />,
    );
    expect(container.textContent).toContain("#thunder");
    expect(
      screen.getByTitle("Suggested automatically at 0.92 confidence")
        .textContent,
    ).toBe("AI 0.92");
  });
});

describe("StatusBadge", () => {
  it("names workflow state as text", () => {
    render(<StatusBadge status="model ready" tone="ready" />);
    expect(screen.getByText("model ready").textContent).toBe("model ready");
  });
});

describe("CommandItem", () => {
  it("keeps listbox semantics and swaps the hint for the run key when active", () => {
    const onClick = vi.fn();
    const { rerender } = render(
      <CommandItem
        role="option"
        aria-selected={false}
        hint="view"
        onClick={onClick}
      >
        Go to Library
      </CommandItem>,
    );
    const idle = screen.getByRole("option", { selected: false });
    expect(idle.textContent).toContain("Go to Library");
    expect(screen.getByText("view").textContent).toBe("view");
    fireEvent.click(idle);
    expect(onClick).toHaveBeenCalledTimes(1);

    rerender(
      <CommandItem
        role="option"
        aria-selected={true}
        active
        hint="view"
        onClick={onClick}
      >
        Go to Library
      </CommandItem>,
    );
    expect(screen.getByRole("option", { selected: true }).textContent).toContain(
      "↵",
    );
  });
});
