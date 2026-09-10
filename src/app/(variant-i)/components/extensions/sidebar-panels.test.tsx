// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  buildEffectiveV2Catalog,
  ExtensionV2Registry,
  type ExtensionV2Definition,
} from "@yard-core";

import { V3ExtensionSidebarPanels } from "./sidebar-panels";

// Area: #246. The sidebar point mounts through the shared availability
// evaluator: it renders while enabled and approved, and disappears when
// either changes.

const definition: ExtensionV2Definition = {
  id: "panel-ext",
  name: "Panel Ext",
  version: "1.0.0",
  apiVersion: 2,
  description: "Test panel extension.",
  permissions: ["library:read"],
  commands: [
    { id: "panel-ext.list", title: "List", description: "List items.", scope: "global" },
  ],
  contributions: [
    {
      id: "panel-ext.sidebar",
      type: "sidebar",
      commandId: "panel-ext.list",
      title: "Panel actions",
    },
  ],
};

function catalogWith(granted: string[]) {
  const registry = new ExtensionV2Registry();
  registry.register(definition);
  return buildEffectiveV2Catalog(registry, () => granted);
}

const capabilities = new Set(["library.read"]);

describe("V3ExtensionSidebarPanels", () => {
  it("renders an available sidebar contribution", () => {
    render(
      <V3ExtensionSidebarPanels
        catalog={catalogWith(["library:read"])}
        uiState={{ enabled: new Set(["panel-ext"]), capabilities }}
        onInvoke={() => {}}
      />,
    );
    expect(screen.getByRole("button", { name: "Panel actions" })).toBeTruthy();
  });

  it("disappears when the extension is disabled", () => {
    const { container } = render(
      <V3ExtensionSidebarPanels
        catalog={catalogWith(["library:read"])}
        uiState={{ enabled: new Set(), capabilities }}
        onInvoke={() => {}}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("disappears when the permission is not approved", () => {
    const { container } = render(
      <V3ExtensionSidebarPanels
        catalog={catalogWith([])}
        uiState={{ enabled: new Set(["panel-ext"]), capabilities }}
        onInvoke={() => {}}
      />,
    );
    expect(container.firstChild).toBeNull();
  });
});
