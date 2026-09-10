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
}: {
  items: V2ResolvedContribution[];
  selectionCount: number;
  onInvoke: (item: V2ResolvedContribution) => void;
}) {
  const eligible = items.filter((item) => item.availability.available);
  const ineligible = items.filter((item) => !item.availability.available);
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
          {eligible.length === 0 ? (
            <span className="text-xs text-zinc-500">
              No extension actions are eligible for this selection.
            </span>
          ) : null}
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