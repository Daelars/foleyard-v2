import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  getExtensionEnabled: () => true,
  setExtensionEnabled: vi.fn(),
}));

vi.mock("@/lib/extensions/settings-store", () => ({
  getExtensionSettingValue: (
    _extensionId: string,
    _settingId: string,
    defaultValue: unknown,
  ) => defaultValue,
}));

import { listRegisteredExtensionGridItems } from "./registry";

describe("listRegisteredExtensionGridItems", () => {
  it("exposes real command IDs alongside titles for dispatch", () => {
    const items = listRegisteredExtensionGridItems();

    expect(items.length).toBeGreaterThan(0);

    for (const item of items) {
      expect(item.commandCount).toBe(item.commands?.length);

      for (const command of item.commands ?? []) {
        expect(command.id, `${item.id} command id`).toMatch(
          new RegExp(`^${item.id}\\.`),
        );
        expect(command.title.length).toBeGreaterThan(0);
      }
    }

    const shelf = items.find((item) => item.id === "sound-shelf");
    expect(shelf?.commands).toContainEqual({
      id: "sound-shelf.clear",
      title: "Clear Shelf",
    });
  });
});
