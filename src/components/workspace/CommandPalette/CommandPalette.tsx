"use client";

import { Fragment, useEffect, useRef, type RefObject } from "react";
import { AudioLines, FileMusic, Library, Play, Search, Sparkles } from "lucide-react";
import { Input } from "@/components/kit/input";
import { Kbd } from "@/components/kit/kbd";
import { CommandItem } from "@/components/kit/foleyard";

import type {
  PaletteEntry,
  PaletteSection,
} from "@/components/CommandPalette/command-palette";

// Variant I's palette: a floating panel with a seam-free search header, rows
// grouped under mono section labels, and a shortcut footer carrying the result
// count. The panel's depth is a real shadow rather than the accent halo the
// previous version drew behind an opaque slab, and the search field is the
// Input's `overlay` variant instead of the shared field with its height,
// radius, border, background, padding, shadow and focus all overridden away.

const SECTION_ICONS: Record<PaletteSection, React.ReactNode> = {
  view: <Library />,
  transport: <Play />,
  sound: <AudioLines />,
  tool: <Sparkles />,
  file: <FileMusic />,
};

const SECTION_LABELS: Record<PaletteSection, string> = {
  view: "Views",
  transport: "Transport",
  sound: "Sounds",
  tool: "Tools",
  file: "File",
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
        className="w-full max-w-lg overflow-hidden rounded-lg border border-edge-hover bg-[#101014]/95 shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_16px_44px_rgba(0,0,0,0.6)] backdrop-blur-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 border-b border-edge px-3">
          <Search className="size-4 shrink-0 text-zinc-500" />
          <Input
            ref={inputRef}
            variant="overlay"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Type a command or sound..."
            aria-label="Type a command or sound"
            aria-controls="command-palette-results"
            aria-activedescendant={
              activeIndex >= 0 ? `command-palette-entry-${activeIndex}` : undefined
            }
          />
          <Kbd>esc</Kbd>
        </div>
        <div
          id="command-palette-results"
          role="listbox"
          aria-label="Command results"
          className="grid max-h-80 gap-0.5 overflow-y-auto p-1.5"
        >
          {entries.length === 0 ? (
            <p className="px-3 py-6 text-center text-[13px] text-zinc-500">No matches.</p>
          ) : (
            entries.map((entry, index) => (
              <Fragment key={entry.id}>
                {index === 0 || entries[index - 1].section !== entry.section ? (
                  <p className="px-3 pt-3 pb-1 font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-600 first:pt-1">
                    {SECTION_LABELS[entry.section]}
                  </p>
                ) : null}
                <CommandItem
                  ref={(node) => {
                    entryRefs.current[index] = node;
                  }}
                  id={`command-palette-entry-${index}`}
                  role="option"
                  aria-selected={index === activeIndex}
                  active={index === activeIndex}
                  icon={SECTION_ICONS[entry.section]}
                  hint={entry.hint}
                  onClick={() => onSelectEntry(entry)}
                  onMouseEnter={() => onHoverEntry(index)}
                >
                  {entry.label}
                </CommandItem>
              </Fragment>
            ))
          )}
        </div>
        <div className="flex items-center gap-4 border-t border-edge px-4 py-2.5 font-mono text-[10px] text-zinc-600">
          <span className="flex items-center gap-1.5">
            <Kbd>↑↓</Kbd> navigate
          </span>
          <span className="flex items-center gap-1.5">
            <Kbd>↵</Kbd> run
          </span>
          <span className="flex items-center gap-1.5">
            <Kbd>esc</Kbd> close
          </span>
          <span className="flex-1" />
          <span>
            {entries.length} command{entries.length === 1 ? "" : "s"}
          </span>
        </div>
      </div>
    </div>
  );
}
