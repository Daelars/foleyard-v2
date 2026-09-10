"use client";

import { useMemo } from "react";

import type { ExtensionV2Catalog, V2ResolvedContribution } from "@yard-core";

import { resolveV2UiPoint, type V2UiState } from "@/lib/extensions-v2/contributions";
import { V2SidebarPanel } from "./sidebar";

/**
 * Generic production mount for `sidebar` contributions (#197). Groups
 * resolved items by extension and renders one list panel each through
 * the shared adapter; extensions never inject markup. Renders nothing
 * when no enabled extension contributes.
 */
export function V2ExtensionSidebarPanels({
  catalog,
  uiState,
  onInvoke,
}: {
  catalog: ExtensionV2Catalog | null;
  uiState: V2UiState;
  onInvoke: (item: V2ResolvedContribution) => void;
}) {
  const groups = useMemo(() => {
    const items = resolveV2UiPoint(catalog, "sidebar", { fileIds: [] }, uiState);
    const byExtension = new Map<string, V2ResolvedContribution[]>();
    for (const item of items) {
      const group = byExtension.get(item.extensionId) ?? [];
      group.push(item);
      byExtension.set(item.extensionId, group);
    }
    return [...byExtension.entries()];
  }, [catalog, uiState]);

  if (groups.length === 0) return null;

  return (
    <div className="grid gap-3">
      {groups.map(([extensionId, items]) => (
        <V2SidebarPanel
          key={extensionId}
          title={items[0]?.extensionName ?? extensionId}
          panelItems={items.map((item) => ({ item }))}
          state={{ status: "ready" }}
          onInvoke={onInvoke}
        />
      ))}
    </div>
  );
}
