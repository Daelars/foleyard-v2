// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Tabs } from "@/components/ui/tabs";
import type { ExtensionGridItem } from "@/lib/extensions/types";
import { ExtensionsTab } from "./extensions-tab";

// Area: component library switches. The row switch carries the extension
// name, and toggling it must not expand the settings section; flipping a
// boolean setting must not toggle the extension itself.
const extension: ExtensionGridItem = {
  id: "folder-janitor",
  name: "Folder Janitor",
  provider: "foleyard",
  version: "0.2.0",
  description: "Find stale and empty folders.",
  category: "workflow",
  enabled: false,
  settings: [
    {
      id: "deep",
      label: "Deep clean",
      description: "Scan nested folders.",
      type: "boolean",
      defaultValue: false,
      value: false,
    },
  ],
};

function renderTab(props: {
  onToggleExtension?: (id: string, enabled: boolean) => void;
  onUpdateExtensionSetting?: (
    extensionId: string,
    settingId: string,
    value: unknown,
  ) => void;
}) {
  return render(
    <Tabs value="extensions">
      <ExtensionsTab extensions={[extension]} {...props} />
    </Tabs>,
  );
}

describe("ExtensionsTab switch", () => {
  it("names the row switch and toggling it does not expand settings", () => {
    const onToggleExtension = vi.fn();
    renderTab({ onToggleExtension });
    expect(
      screen.getByRole("button", { name: "Show Folder Janitor settings" }),
    ).toBeDefined();

    fireEvent.click(
      screen.getByRole("switch", { name: "Toggle Folder Janitor" }),
    );
    expect(onToggleExtension).toHaveBeenCalledWith("folder-janitor", true);
    expect(
      screen.getByRole("button", { name: "Show Folder Janitor settings" }),
    ).toBeDefined();
  });

  it("updates a boolean setting without toggling the extension", () => {
    const onToggleExtension = vi.fn();
    const onUpdateExtensionSetting = vi.fn();
    renderTab({ onToggleExtension, onUpdateExtensionSetting });
    fireEvent.click(
      screen.getByRole("button", { name: "Show Folder Janitor settings" }),
    );
    fireEvent.click(screen.getByRole("switch", { name: "Deep clean" }));
    expect(onUpdateExtensionSetting).toHaveBeenCalledWith(
      "folder-janitor",
      "deep",
      true,
    );
    expect(onToggleExtension).not.toHaveBeenCalled();
  });
});
