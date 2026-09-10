"use client";

// app-v3 adapter for CommandPalette: same props, real palette entries,
// I command panel treatment with section headers and shortcut footer.
import { useEffect, useRef, type RefObject } from "react";
import { AudioLines, FileMusic, Library, Play, Search, Sparkles } from "lucide-react";

import {
  CommandFooter,
  CommandPanel,
  CommandRow,
  CommandSection,
  Kbd,
} from "@/components/variant-i";

import type { PaletteEntry, PaletteSection } from "@/components/CommandPalette/command-palette";

const SECTION_ICONS: Record<PaletteSection, React.ReactNode> = {
  view: <Library />,
  transport: <Play />,
  sound: <AudioLines />,
  tool: <Sparkles />,
  file: <FileMusic />,
};

export function V3CommandPalette({
  open,
  query,
  entries,
  activeIndex,
  inputRef,
  onQueryChange,
  onHoverEntry,
  onSelectEntry,
  onClose,
}: {
  open: boolean;
  query: string;
  entries: PaletteEntry[];
  activeIndex: number;
  inputRef: RefObject<HTMLInputElement | null>;
  onQueryChange: (query: string) => void;
  onHoverEntry: (index: number) => void;
  onSelectEntry: (entry: PaletteEntry) => void;
  onClose: () => void;
}) {
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
      <div className="w-full max-w-lg" onClick={(event) => event.stopPropagation()}>
        <CommandPanel>
          <div className="flex items-center gap-2.5 border-b border-white/[0.07] px-4">
            <Search className="size-4 shrink-0 text-zinc-500" />
            <input
              ref={inputRef}
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder="Type a command or sound…"
              aria-label="Type a command or sound"
              aria-controls="command-palette-results"
              aria-activedescendant={
                activeIndex >= 0 ? `command-palette-entry-${activeIndex}` : undefined
              }
              className="h-12 w-full bg-transparent text-sm text-zinc-100 outline-none placeholder:text-zinc-600"
            />
            <Kbd>esc</Kbd>
          </div>
          <div
            id="command-palette-results"
            role="listbox"
            aria-label="Command results"
            className="vi-scroll grid max-h-80 gap-0.5 overflow-y-auto p-1.5"
          >
            {entries.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-zinc-500">No matches.</p>
            ) : (
              entries.map((entry, index) => {
                const newSection = index === 0 || entries[index - 1].section !== entry.section;
                return (
                  <div key={entry.id}>
                    {newSection ? <CommandSection>{entry.section}</CommandSection> : null}
                    <CommandRow
                      ref={(node) => {
                        entryRefs.current[index] = node;
                      }}
                      id={`command-palette-entry-${index}`}
                      role="option"
                      aria-selected={index === activeIndex}
                      active={index === activeIndex}
                      hint={entry.hint}
                      icon={SECTION_ICONS[entry.section]}
                      onClick={() => onSelectEntry(entry)}
                      onMouseEnter={() => onHoverEntry(index)}
                    >
                      {entry.label}
                    </CommandRow>
                  </div>
                );
              })
            )}
          </div>
          <CommandFooter count={entries.length} />
        </CommandPanel>
      </div>
    </div>
  );
}