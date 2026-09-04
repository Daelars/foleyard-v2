"use client";

import { Fragment, type RefObject } from "react";
import { CornerDownLeft, Search } from "lucide-react";

import type { PaletteEntry, PaletteSection } from "./command-palette";

const SECTION_TITLES: Record<PaletteSection, string> = {
  view: "Views",
  transport: "Transport",
  file: "File",
  tool: "Tools",
  sound: "Sounds",
};

type CommandPaletteProps = {
  open: boolean;
  query: string;
  entries: PaletteEntry[];
  activeIndex: number;
  inputRef: RefObject<HTMLInputElement | null>;
  onQueryChange: (query: string) => void;
  onHoverEntry: (index: number) => void;
  onSelectEntry: (entry: PaletteEntry) => void;
  onClose: () => void;
};

export function CommandPalette({
  open,
  query,
  entries,
  activeIndex,
  inputRef,
  onQueryChange,
  onHoverEntry,
  onSelectEntry,
  onClose,
}: CommandPaletteProps) {
  if (!open) {
    return null;
  }

  let lastSection: PaletteSection | null = null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 p-4 pt-[12vh] backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="w-full max-w-lg overflow-hidden rounded-2xl border border-accent-fill/30 bg-shell/95 shadow-glow-accent-strong backdrop-blur-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-white/10 px-4">
          <Search className="size-4 shrink-0 text-zinc-500" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Type a command or sound..."
            aria-label="Type a command or sound"
            className="w-full bg-transparent py-3.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none"
          />
          <kbd className="shrink-0 rounded-md border border-white/10 bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-zinc-500">
            esc
          </kbd>
        </div>
        <div className="max-h-80 overflow-y-auto p-1.5">
          {entries.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-zinc-500">
              No matches.
            </p>
          ) : (
            entries.map((entry, index) => {
              const showHeader = entry.section !== lastSection;
              lastSection = entry.section;

              return (
                <Fragment key={entry.id}>
                  {showHeader ? (
                    <p className="px-3 pb-1 pt-2 font-mono text-[10px] uppercase tracking-widest text-zinc-600">
                      {SECTION_TITLES[entry.section]}
                    </p>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => onSelectEntry(entry)}
                    onMouseEnter={() => onHoverEntry(index)}
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm transition-colors ${index === activeIndex ? "bg-accent-fill/15 text-accent-text" : "text-zinc-200"}`}
                  >
                    <span className="min-w-0 flex-1 truncate">
                      {entry.label}
                    </span>
                    <span className="shrink-0 font-mono text-[10px] uppercase tracking-widest text-zinc-600">
                      {entry.hint}
                    </span>
                    {index === activeIndex ? (
                      <CornerDownLeft className="size-3.5 shrink-0" />
                    ) : null}
                  </button>
                </Fragment>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
