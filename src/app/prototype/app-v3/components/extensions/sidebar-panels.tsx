"use client";

import { useMemo } from "react";
import { ListMusic } from "lucide-react";

import type { ExtensionV2Catalog, V2ResolvedContribution } from "@yard-core";

import { resolveV2UiPoint, type V2UiState } from "@/lib/extensions-v2/contributions";
import { useV2FocusRestore } from "@/components/extensions-v2/shared";

/**
 * I-styled production mount for `sidebar` contributions. Resolves items
 * by extension and renders one panel per contributing extension with the
 * I surface treatment: rounded panel, mono uppercase label, and
 * MenuItem-style list rows with unavailability reasons.
 */
export function V3ExtensionSidebarPanels({
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

  useV2FocusRestore(groups.length > 0);

  if (groups.length === 0) return null;

  return (
    <div className="grid gap-3">
      {groups.map(([extensionId, items]) => (
        <section
          key={extensionId}
          aria-label={items[0]?.extensionName ?? extensionId}
          className="min-w-0 rounded-lg border border-[var(--vi-edge)] bg-black/25 p-3"
        >
          <header className="flex items-center gap-2">
            <ListMusic className="size-4 shrink-0 text-zinc-500" aria-hidden="true" />
            <h2 className="min-w-0 flex-1 truncate font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-500">
              {items[0]?.extensionName ?? extensionId}
            </h2>
          </header>
          <ul className="mt-2 min-w-0 space-y-1">
            {items.map((item) => {
              const disabled = !item.availability.available;
              return (
                <li key={item.key}>
                  <button
                    type="button"
                    disabled={disabled}
                    aria-disabled={disabled}
                    onClick={() => onInvoke(item)}
                    title={
                      item.availability.available
                        ? item.title
                        : item.availability.reason
                    }
                    className="flex w-full min-w-0 items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[13px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--vi-focus)] disabled:cursor-not-allowed disabled:text-zinc-600 enabled:text-zinc-300 enabled:hover:bg-white/[0.04]"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{item.title}</span>
                      {!item.availability.available ? (
                        <span className="block truncate text-[11px] text-zinc-600">
                          {item.availability.reason}
                        </span>
                      ) : null}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}