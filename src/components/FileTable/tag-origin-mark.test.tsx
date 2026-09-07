// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { TagOriginMark } from "./tag-origin-mark";

// Area: provenance UI (#193). The origin mark renders nothing without an
// origin, M for manual, D for deterministic, and AI plus confidence for
// semantic attachments.
describe("TagOriginMark", () => {
  it("renders nothing without an origin", () => {
    const { container } = render(<TagOriginMark origin={undefined} />);
    expect(container.textContent).toBe("");
  });

  it("marks manual and deterministic attachments", () => {
    const { rerender } = render(<TagOriginMark origin="manual" />);
    expect(screen.getByTitle("Added by hand").textContent).toBe("M");
    rerender(<TagOriginMark origin="deterministic" />);
    expect(screen.getByTitle("Fired by a filename rule").textContent).toBe("D");
  });

  it("marks semantic attachments with confidence", () => {
    render(<TagOriginMark origin="semantic_ai" confidence={0.83} />);
    expect(screen.getByText("AI 0.83")).toBeDefined();
  });
});
