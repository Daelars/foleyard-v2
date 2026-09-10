"use client";

import { useEffect, useRef } from "react";

import type { V2ResolvedContribution } from "@yard-core";
import { cn } from "@/lib/utils";

/**
 * Shared affordances for the generic v2 contribution renderers
 * (Application context, R6).
 *
 * Accessibility baseline every adapter follows: keyboard-operable
 * controls, visible focus, focus restoration when a panel closes or
 * unmounts, `prefers-reduced-motion` respected through
 * `motion-reduce:` utilities, theme tokens only (no hardcoded
 * palette), and narrow layouts via wrapping/truncation instead of
 * horizontal page scroll. v1 entries and shortcuts are untouched —
 * these components render alongside them.
 */

/** Restore focus to the previously focused element when `active` flips false or on unmount. */
export function useV2FocusRestore(active: boolean): void {
  const previous = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (active) {
      previous.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      return;
    }
    const target = previous.current;
    previous.current = null;
    if (target && document.contains(target)) {
      target.focus({ preventScroll: true });
    }
  }, [active]);
  useEffect(
    () => () => {
      const target = previous.current;
      previous.current = null;
      if (target && document.contains(target)) {
        target.focus({ preventScroll: true });
      }
    },
    [],
  );
}

/** User-readable unavailability reason for a disabled entry. */
export function V2UnavailableReason({ item }: { item: V2ResolvedContribution }) {
  if (item.availability.available) return null;
  return (
    <span className="block truncate text-[11px] font-normal text-zinc-500">
      {item.availability.reason}
    </span>
  );
}

export function v2ItemDisabled(item: V2ResolvedContribution): boolean {
  return !item.availability.available;
}

export const v2PanelClass = cn(
  "w-full min-w-0 rounded-xl border border-white/10 bg-white/[0.03]",
);

export const v2FocusRing =
  "outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background";
