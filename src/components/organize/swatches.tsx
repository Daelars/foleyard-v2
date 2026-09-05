"use client";

import { ITEM_COLOR_PRESETS } from "@/lib/item-colors";

export function Swatches({
  value,
  onPick,
}: {
  value: string;
  onPick: (color: string) => void;
}) {
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      {ITEM_COLOR_PRESETS.map((color) => (
        <button
          key={color}
          type="button"
          onClick={() => onPick(color)}
          aria-label={`Pick ${color}`}
          style={{ backgroundColor: color }}
          className={`size-5 rounded-full transition-transform hover:scale-110 active:scale-95 ${
            value === color
              ? "ring-2 ring-white ring-offset-2 ring-offset-black"
              : "opacity-70 hover:opacity-100"
          }`}
        />
      ))}
    </span>
  );
}
