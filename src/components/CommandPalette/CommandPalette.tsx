"use client";

import { useEffect, useRef, type RefObject } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { CommandItem } from "@/components/ui/foleyard";

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
        className="w-full max-w-lg overflow-hidden rounded-xl border border-white/15 bg-shell/95 shadow-glow-overlay backdrop-blur-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-white/10 px-5">
          <Search className="size-4 shrink-0 text-zinc-500" />
          <Input
            ref={inputRef}
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Type a command or sound..."
            aria-label="Type a command or sound"
            aria-controls="command-palette-results"
            aria-activedescendant={
              activeIndex >= 0 ? `command-palette-entry-${activeIndex}` : undefined
            }
            className="h-12 rounded-none border-0 bg-transparent px-0 py-4 text-[14px] shadow-none focus-visible:border-0 focus-visible:bg-transparent focus-visible:ring-0"
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
              <CommandItem
                key={entry.id}
                ref={(node) => {
                  entryRefs.current[index] = node;
                }}
                id={`command-palette-entry-${index}`}
                role="option"
                aria-selected={index === activeIndex}
                active={index === activeIndex}
                hint={entry.hint}
                onClick={() => onSelectEntry(entry)}
                onMouseEnter={() => onHoverEntry(index)}
              >
                {entry.label}
              </CommandItem>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
