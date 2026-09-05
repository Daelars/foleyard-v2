import { describe, expect, it } from "vitest";

import {
  isTagDeleteArmed,
  resolveTagEscape,
  switchEditingTag,
} from "./tag-confirm";

describe("tag delete confirmation", () => {
  it("arms per tag id so one tag never leaks into another", () => {
    const armed: string | null = "tag-a";
    expect(isTagDeleteArmed(armed, "tag-a")).toBe(true);
    expect(isTagDeleteArmed(armed, "tag-b")).toBe(false);
  });

  it("disarms on Escape but keeps editing open; a second Escape closes", () => {
    const first = resolveTagEscape("tag-a", "tag-a", "tag-a");
    expect(first).toEqual({ confirmTagDeleteId: null, editingTagId: "tag-a" });
    const second = resolveTagEscape(
      first.confirmTagDeleteId,
      first.editingTagId,
      "tag-a",
    );
    expect(second).toEqual({ confirmTagDeleteId: null, editingTagId: null });
  });

  it("Escape on an unarmed tag closes editing without touching other tags", () => {
    expect(resolveTagEscape(null, "tag-a", "tag-a")).toEqual({
      confirmTagDeleteId: null,
      editingTagId: null,
    });
  });

  it("switching the edited tag clears the armed confirmation", () => {
    expect(switchEditingTag()).toBeNull();
  });
});
