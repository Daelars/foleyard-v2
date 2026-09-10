// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  toCatalogEntry,
  type ExtensionV2Catalog,
  type V2ResolvedContribution,
} from "@yard-core";
import { createSurfaceFixtureDefinition } from "@/lib/extensions-v2/fixtures";

import { V2ExtensionSidebarPanels } from "./sidebar-panels";

// Area: extension page (#197). The generic sidebar mount groups
// resolved sidebar contributions by extension and invokes by key;
// nothing renders when no enabled extension contributes.
function catalog(): ExtensionV2Catalog {
  return {
    apiVersion: 2,
    entries: [toCatalogEntry(createSurfaceFixtureDefinition())],
  };
}

describe("V2ExtensionSidebarPanels", () => {
  it("mounts one panel per contributing extension", () => {
    const onInvoke = vi.fn();
    render(
      <V2ExtensionSidebarPanels
        catalog={catalog()}
        uiState={{
          enabled: ["fixture-surface"],
          capabilities: {},
        }}
        onInvoke={onInvoke}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Recent pings/ }));
    expect(onInvoke).toHaveBeenCalledTimes(1);
    const item = onInvoke.mock.calls[0]![0] as V2ResolvedContribution;
    expect(item.contributionType).toBe("sidebar");
  });

  it("renders nothing with no enabled contributions", () => {
    const { container } = render(
      <V2ExtensionSidebarPanels
        catalog={catalog()}
        uiState={{ enabled: [], capabilities: {} }}
        onInvoke={() => {}}
      />,
    );
    expect(container.textContent).toBe("");
  });
});
