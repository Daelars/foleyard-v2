// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PendingButton } from "./foleyard";

// Area: component library. Pending actions gate while busy so a second
// click cannot double-submit.
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
