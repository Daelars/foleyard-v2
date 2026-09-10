// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { V3SearchField } from "./search-field";

// Area: #259. Keystrokes stay in the field until the commit debounce, so the
// workspace root is not re-rendered per character; external value changes
// (smart collection open, navigation clears) resync the draft.

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

function Harness({
  initial = "",
  onCommit,
}: {
  initial?: string;
  onCommit: (value: string) => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <V3SearchField
      value={value}
      onCommit={(next) => {
        onCommit(next);
        setValue(next);
      }}
      onOpenPalette={() => {}}
      fileCount={0}
    />
  );
}

describe("V3SearchField", () => {
  it("keeps keystrokes local until the debounce settles", () => {
    const onCommit = vi.fn();
    render(<Harness onCommit={onCommit} />);
    const input = screen.getByLabelText("Search sounds");

    fireEvent.change(input, { target: { value: "k" } });
    fireEvent.change(input, { target: { value: "ki" } });
    expect((input as HTMLInputElement).value).toBe("ki");
    expect(onCommit).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith("ki");
  });

  it("clears immediately without waiting for the debounce", () => {
    const onCommit = vi.fn();
    render(<Harness initial="kick" onCommit={onCommit} />);

    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(onCommit).toHaveBeenCalledWith("");
    expect(screen.queryByRole("button", { name: "Clear" })).toBeNull();
  });

  it("adopts a value set outside the field", () => {
    function Controlled({ value }: { value: string }) {
      return (
        <V3SearchField
          value={value}
          onCommit={() => {}}
          onOpenPalette={() => {}}
          fileCount={0}
        />
      );
    }
    const { rerender } = render(<Controlled value="" />);
    const input = screen.getByLabelText("Search sounds");
    expect((input as HTMLInputElement).value).toBe("");

    rerender(<Controlled value="rain" />);
    expect((input as HTMLInputElement).value).toBe("rain");
  });
});
