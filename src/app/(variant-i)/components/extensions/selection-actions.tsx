"use client";

import { Puzzle } from "lucide-react";

import { Button } from "@/components/variant-i";
import type { V2ResolvedContribution } from "@yard-core";

/**
 * I-styled selection actions for the current v2 selection. Eligible
 * actions render as `Button` (secondary, small) with the Puzzle glyph;
 * ineligible ones render as inert mono-ish text with the reason as a
 * title. Never a blank bar: explicit empty/ineligible messaging stays.
 */
export function V3SelectionActions({
  items,
  selectionCount,
  onInvoke,
  resolveBlockedReason,
}: {
  items: V2ResolvedContribution[];
  selectionCount: number;
  onInvoke: (item: V2ResolvedContribution) => void;
  /**
   * Optional reason a command needs a surface that is not mounted here
   * (#294). A blocked item renders inert with the reason, never as a
   * button that would half-execute.
   */
  resolveBlockedReason?: (item: V2ResolvedContribution) => string | null;
}) {
  const blockedReason = (item: V2ResolvedContribution): string | null =>
    resolveBlockedReason?.(item) ?? null;
  const eligible = items.filter(
    (item) => item.availability.available && blockedReason(item) === null,
  );
  const ineligible = items.filter(
    (item) => !item.availability.available,
  );
  const blocked = items.filter(
    (item) => item.availability.available && blockedReason(item) !== null,
  );
  return (
    <div
      className="flex flex-wrap items-center gap-2"
      role="toolbar"
      aria-label="Extension selection actions"
    >
      <span className="font-mono text-xs font-semibold tabular-nums text-accent-text">
        {selectionCount} selected
      </span>
      {items.length === 0 || selectionCount === 0 ? (
        <span className="text-xs text-zinc-500">
          {selectionCount === 0
            ? "Select Library items to see extension actions."
            : "No extension actions registered for selections."}
        </span>
      ) : (
        <>
          {eligible.map((item) => (
            <Button
              key={item.key}
              tone="secondary"
              size="sm"
              onClick={() => onInvoke(item)}
              title={`${item.title} · ${item.extensionName}`}
            >
              <Puzzle />
              {item.title}
            </Button>
          ))}
          {eligible.length === 0 && blocked.length === 0 ? (
            <span className="text-xs text-zinc-500">
              No extension actions are eligible for this selection.
            </span>
          ) : null}
          {blocked.map((item) => (
            <span
              key={item.key}
              className="cursor-not-allowed truncate text-xs text-zinc-600"
              title={blockedReason(item) ?? item.title}
            >
              {item.title}
            </span>
          ))}
          {ineligible.map((item) => (
            <span
              key={item.key}
              className="cursor-not-allowed truncate text-xs text-zinc-600"
              title={
                !item.availability.available ? item.availability.reason : item.title
              }
            >
              {item.title}
            </span>
          ))}
        </>
      )}
    </div>
  );
}