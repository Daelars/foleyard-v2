"use client";

import { ListMusic } from "lucide-react";

import type { V2ResolvedContribution } from "@yard-core";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { useV2FocusRestore, v2FocusRing, v2PanelClass } from "./shared";

/**
 * Generic v2 sidebar list panel (Application context, R6).
 *
 * One panel serves every `sidebar` contribution: header title, body
 * states (loading skeleton, error with retry, empty hint, item list),
 * and per-item actions invoking by stable key. Item payloads are the
 * resolved contribution plus an optional caller-supplied subtitle —
 * extensions never inject markup. Collapses gracefully in narrow
 * layouts (full-width, wrapping rows).
 */
export type V2SidebarItem = {
  item: V2ResolvedContribution;
  subtitle?: string;
};

export type V2SidebarState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready" };

export function V2SidebarPanel({
  title,
  panelItems,
  state,
  onInvoke,
  onRetry,
  emptyHint = "Nothing here yet.",
}: {
  title: string;
  panelItems: V2SidebarItem[];
  state: V2SidebarState;
  onInvoke: (item: V2ResolvedContribution) => void;
  onRetry?: () => void;
  emptyHint?: string;
}) {
  useV2FocusRestore(state.status !== "loading");
  return (
    <section
      aria-label={title}
      className={cn(v2PanelClass, "flex min-w-0 flex-col overflow-hidden")}
    >
      <header className="flex items-center gap-2 border-b border-white/10 px-3 py-2.5">
        <ListMusic className="size-4 shrink-0 text-zinc-500" aria-hidden="true" />
        <h2 className="min-w-0 flex-1 truncate text-sm font-semibold text-zinc-100">
          {title}
        </h2>
      </header>
      <div className="min-w-0 flex-1 p-2">
        {state.status === "loading" ? (
          <ul aria-label="Loading" className="space-y-1.5 p-1">
            {[0, 1, 2].map((index) => (
              <li
                key={index}
                aria-hidden="true"
                className="h-9 animate-pulse rounded-lg bg-white/5 motion-reduce:animate-none"
              />
            ))}
          </ul>
        ) : state.status === "error" ? (
          <div role="alert" className="flex flex-col items-start gap-2 p-2">
            <p className="text-xs text-zinc-400">{state.message}</p>
            {onRetry ? (
              <Button
                type="button"
                variant="outline"
                size="xs"
                onClick={onRetry}
                className={v2FocusRing}
              >
                Retry
              </Button>
            ) : null}
          </div>
        ) : panelItems.length === 0 ? (
          <p className="p-2 text-xs text-zinc-500">{emptyHint}</p>
        ) : (
          <ul className="min-w-0 space-y-1">
            {panelItems.map(({ item, subtitle }) => {
              const disabled = !item.availability.available;
              return (
                <li key={item.key}>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => onInvoke(item)}
                    title={
                      disabled && !item.availability.available
                        ? item.availability.reason
                        : (subtitle ?? item.title)
                    }
                    aria-disabled={disabled}
                    className={cn(
                      "flex w-full min-w-0 items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors motion-reduce:transition-none",
                      disabled
                        ? "cursor-not-allowed text-zinc-600"
                        : "text-zinc-300 hover:bg-white/[0.04] focus-visible:bg-accent-fill/10",
                      v2FocusRing,
                    )}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{item.title}</span>
                      {subtitle ? (
                        <span className="block truncate text-[11px] text-zinc-500">
                          {subtitle}
                        </span>
                      ) : null}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
