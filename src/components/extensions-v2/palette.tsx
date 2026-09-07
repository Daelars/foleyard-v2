"use client";

import { useRef } from "react";

import type { V2ResolvedContribution } from "@yard-core";
import { cn } from "@/lib/utils";

import { V2UnavailableReason, useV2FocusRestore, v2FocusRing } from "./shared";

/**
 * Generic v2 command-palette section (Application context, R6).
 *
 * Renders resolved `palette`-point items as listbox options with
 * availability reasons and invocation. Unavailable entries stay
 * visible but disabled with their reason (never silently hidden), so
 * keyboard users learn what a command needs. Arrow-key navigation is
 * roving: the section handles Up/Down/Home/End and Enter activation
 * when used standalone, and composes inside the existing palette
 * (whose own cursor drives selection there) without touching v1
 * entries. Focus returns to the invoker when the panel closes.
 */
export function V2PaletteSection({
  items,
  onInvoke,
  active = true,
  emptyHint = "No extension commands match.",
}: {
  items: V2ResolvedContribution[];
  onInvoke: (item: V2ResolvedContribution) => void;
  active?: boolean;
  emptyHint?: string;
}) {
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  useV2FocusRestore(active);

  const focusOption = (index: number) => {
    const clamped = Math.max(0, Math.min(index, items.length - 1));
    optionRefs.current[clamped]?.focus();
  };

  if (items.length === 0) {
    return <p className="px-3 py-4 text-center text-xs text-zinc-500">{emptyHint}</p>;
  }

  return (
    <div role="group" aria-label="Extension commands">
      {items.map((item, index) => {
        const disabled = !item.availability.available;
        return (
          <button
            key={item.key}
            ref={(node) => {
              optionRefs.current[index] = node;
            }}
            type="button"
            role="option"
            aria-selected={false}
            disabled={disabled}
            title={disabled && !item.availability.available ? item.availability.reason : item.title}
            aria-disabled={disabled}
            onClick={() => {
              if (!disabled) onInvoke(item);
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                focusOption(index + 1 >= items.length ? 0 : index + 1);
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                focusOption(index - 1 < 0 ? items.length - 1 : index - 1);
              } else if (event.key === "Home") {
                event.preventDefault();
                focusOption(0);
              } else if (event.key === "End") {
                event.preventDefault();
                focusOption(items.length - 1);
              }
            }}
            className={cn(
              "flex w-full min-w-0 items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors motion-reduce:transition-none",
              disabled
                ? "cursor-not-allowed text-zinc-600"
                : "text-zinc-300 hover:bg-white/[0.04] focus-visible:bg-accent-fill/10 focus-visible:text-zinc-50",
              v2FocusRing,
            )}
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate">{item.title}</span>
              <V2UnavailableReason item={item} />
            </span>
            <span className="shrink-0 font-mono text-[10px] uppercase tracking-widest text-zinc-600">
              {item.extensionName}
            </span>
          </button>
        );
      })}
    </div>
  );
}
