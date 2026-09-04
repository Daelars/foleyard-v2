"use client";

import { Play } from "lucide-react";

import { COLOR_PRESETS, MiniBars } from "../showcase/data";

export function tintStyle(color: string): React.CSSProperties {
  return { borderColor: `${color}80`, backgroundColor: `${color}14` };
}

export function Swatches({
  value,
  onPick,
}: {
  value: string;
  onPick: (color: string) => void;
}) {
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      {COLOR_PRESETS.map((color) => (
        <button
          key={color}
          type="button"
          onClick={() => onPick(color)}
          aria-label={`Pick ${color}`}
          style={{ backgroundColor: color }}
          className={`size-5 rounded-full transition-transform hover:scale-110 ${
            value === color
              ? "ring-2 ring-white ring-offset-2 ring-offset-black"
              : "opacity-70 hover:opacity-100"
          }`}
        />
      ))}
    </span>
  );
}

export function FakeDimRows({ count = 5 }: { count?: number }) {
  return (
    <div className="pointer-events-none select-none space-y-0 opacity-70 blur-[1.5px]" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          className="grid grid-cols-[32px_minmax(0,1fr)_140px_64px_28px] items-center gap-3 border-b border-white/5 px-3"
          style={{ height: "56px" }}
        >
          <span className="flex justify-center text-zinc-600">
            <Play className="size-4" />
          </span>
          <span className="min-w-0">
            <span className="block h-3.5 w-2/5 rounded bg-white/10" />
            <span className="mt-1.5 block h-2.5 w-1/3 rounded bg-white/[0.07]" />
          </span>
          <span className="hidden min-w-0 sm:block">
            <span className="block h-[26px]">
              <MiniBars seed={i + 11} />
            </span>
          </span>
          <span className="h-2.5 w-8 justify-self-end rounded bg-white/10" />
          <span />
        </div>
      ))}
    </div>
  );
}

export function AppBackdrop({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-white/10 bg-canvas">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,color-mix(in_oklab,var(--accent-fill)_13%,transparent),transparent_38%),radial-gradient(circle_at_bottom_right,color-mix(in_oklab,var(--accent-fill)_6%,transparent),transparent_40%)]" />
      <div className="relative">
        <FakeDimRows />
      </div>
      <div className="relative flex justify-center px-4 pb-10 pt-6">{children}</div>
    </div>
  );
}
