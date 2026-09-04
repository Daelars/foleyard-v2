"use client";

import { Search } from "lucide-react";

import { VariantFrame } from "../showcase/data";
import { AppBackdrop } from "./shared";

const ROWS = [
  { label: "Go to Library", hint: "view" },
  { label: "Go to Favorites", hint: "view" },
  { label: "Go to Shelf", hint: "view" },
  { label: "Go to Extensions", hint: "view" },
  { label: "Open settings", hint: "view" },
  { label: "Pause", hint: "transport" },
  { label: "Next in queue", hint: "transport" },
  { label: "rain-loop.wav", hint: "wav · 1:05" },
];

export function PaletteV2() {
  return (
    <VariantFrame
      id="V2-P"
      name="Revised quiet, in context"
      note="Same recipe over a live backdrop: shell/85, soft orange glow, blur lets the app through."
    >
      <AppBackdrop>
        <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-white/10 bg-shell/85 shadow-glow-overlay backdrop-blur-2xl">
          <div className="flex items-center gap-3 border-b border-white/10 px-5">
            <Search className="size-4 shrink-0 text-zinc-500" />
            <input
              placeholder="Type a command or sound..."
              aria-label="Type a command or sound"
              className="w-full bg-transparent py-4 text-[15px] text-zinc-100 placeholder:text-zinc-600 focus:outline-none"
            />
            <kbd className="shrink-0 rounded-md border border-white/10 bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-zinc-500">
              esc
            </kbd>
          </div>
          <div className="max-h-80 overflow-y-auto p-2">
            {ROWS.map((row, i) => (
              <button
                key={row.label}
                type="button"
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${
                  i === 2
                    ? "bg-accent-fill/10 text-zinc-50 ring-1 ring-inset ring-accent-fill/30"
                    : "text-zinc-300 hover:bg-white/[0.04]"
                }`}
              >
                <span className="min-w-0 flex-1 truncate">{row.label}</span>
                {i === 2 ? (
                  <kbd className="shrink-0 rounded border border-white/15 bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400">
                    ↵
                  </kbd>
                ) : (
                  <span className="shrink-0 font-mono text-[10px] uppercase tracking-widest text-zinc-600">
                    {row.hint}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </AppBackdrop>
    </VariantFrame>
  );
}
