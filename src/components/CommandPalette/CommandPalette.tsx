"use client";

import { useEffect, useRef, type RefObject } from "react";
import { Search } from "lucide-react";

import type { PaletteEntry } from "./command-palette";

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
  const entryRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    if (open && activeIndex >= 0) {
      entryRefs.current[activeIndex]?.scrollIntoView({ block: "nearest" });
    }
  }, [activeIndex, open]);

  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 p-4 pt-[12vh] backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="w-full max-w-lg overflow-hidden rounded-2xl border border-white/10 bg-shell/90 shadow-glow-accent backdrop-blur-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-white/10 px-5">
          <Search className="size-4 shrink-0 text-zinc-500" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Type a command or sound..."
            aria-label="Type a command or sound"
            aria-controls="command-palette-results"
            aria-activedescendant={
              activeIndex >= 0 ? `command-palette-entry-${activeIndex}` : undefined
            }
            className="w-full bg-transparent py-4 text-[15px] text-zinc-100 placeholder:text-zinc-600 focus:outline-none"
          />
          <kbd className="shrink-0 rounded-md border border-white/10 bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-zinc-500">
            esc
          </kbd>
        </div>
        <div
          id="command-palette-results"
          role="listbox"
          aria-label="Command results"
          className="max-h-80 overflow-y-auto p-2"
        >
          {entries.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-zinc-500">
              No matches.
            </p>
          ) : (
            entries.map((entry, index) => (
              <button
                key={entry.id}
                ref={(node) => {
                  entryRefs.current[index] = node;
                }}
                id={`command-palette-entry-${index}`}
                role="option"
                aria-selected={index === activeIndex}
                type="button"
                onClick={() => onSelectEntry(entry)}
                onMouseEnter={() => onHoverEntry(index)}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${
                  index === activeIndex
                    ? "bg-accent-fill/10 text-zinc-50 ring-1 ring-inset ring-accent-fill/30"
                    : "text-zinc-300 hover:bg-white/[0.04]"
                }`}
              >
                <span className="min-w-0 flex-1 truncate">{entry.label}</span>
                {index === activeIndex ? (
                  <kbd className="shrink-0 rounded border border-white/15 bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400">
                    ↵
                  </kbd>
                ) : (
                  <span className="shrink-0 font-mono text-[10px] uppercase tracking-widest text-zinc-600">
                    {entry.hint}
                  </span>
                )}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
