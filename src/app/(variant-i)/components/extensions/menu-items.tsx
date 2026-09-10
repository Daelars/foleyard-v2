"use client";

import { Puzzle } from "lucide-react";

import { MenuItem, MenuSeparator } from "@/components/variant-i";
import type { V2ResolvedContribution } from "@yard-core";

/**
 * v2 contributions for row menus, rendered with the I `MenuItem`
 * treatment. Unavailable items stay disabled with the reason as a
 * subtitle and title; invocation is guarded. Returns nothing when no
 * items resolve, so callers can mount it without a length check.
 */
export function V3V2MenuItems({
  items,
  onInvoke,
}: {
  items: V2ResolvedContribution[];
  onInvoke: (item: V2ResolvedContribution) => void;
}) {
  if (items.length === 0) return null;
  return (
    <>
      <MenuSeparator />
      {items.map((item) => {
        const disabled = !item.availability.available;
        return (
          <MenuItem
            key={item.key}
            icon={<Puzzle />}
            disabled={disabled}
            title={
              item.availability.available
                ? `${item.title} · ${item.extensionName}`
                : item.availability.reason
            }
            onClick={() => {
              if (!disabled) onInvoke(item);
            }}
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate">{item.title}</span>
              {!item.availability.available ? (
                <span className="block truncate text-[10px] text-zinc-600">
                  {item.availability.reason}
                </span>
              ) : null}
            </span>
          </MenuItem>
        );
      })}
    </>
  );
}