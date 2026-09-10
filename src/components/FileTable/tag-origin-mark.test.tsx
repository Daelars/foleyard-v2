// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { TagOriginMark } from "./tag-origin-mark";

// Area: provenance UI (#193). The origin mark renders nothing without an
// origin, M for manual, D for deterministic, and AI plus confidence for
// semantic attachments.
describe("TagOriginMark", () => {
  it("renders nothing without an origin, M/D by rule, and AI with confidence", () => {
    const { container, rerender } = render(<TagOriginMark origin={undefined} />);
    expect(container.textContent).toBe("");

    rerender(<TagOriginMark origin="manual" />);
    expect(screen.getByTitle("Added by hand").textContent).toBe("M");
    rerender(<TagOriginMark origin="deterministic" />);
    expect(screen.getByTitle("Fired by a filename rule").textContent).toBe("D");

    rerender(<TagOriginMark origin="semantic_ai" confidence={0.83} />);
    expect(screen.getByText("AI 0.83")).toBeDefined();
  });
});
