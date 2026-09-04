"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";

export type MockPaletteEntry = {
  id: string;
  label: string;
  hint: string;
};

export function MockPalette({
  open,
  entries,
  onSelect,
  onClose,
}: {
  open: boolean;
  entries: MockPaletteEntry[];
  onSelect: (entry: MockPaletteEntry) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      return entries;
    }
    return entries.filter(
      (entry) =>
        entry.label.toLowerCase().includes(q) || entry.hint.toLowerCase().includes(q),
    );
  }, [entries, query]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        event.stopPropagation();
        setIndex((i) => (i + 1) % Math.max(1, filtered.length));
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        event.stopPropagation();
        setIndex(
          (i) => (i - 1 + Math.max(1, filtered.length)) % Math.max(1, filtered.length),
        );
        return;
      }
      if (event.key === "Enter") {
        const entry = filtered[Math.min(index, Math.max(0, filtered.length - 1))];
        if (entry) {
          event.preventDefault();
          event.stopPropagation();
          onSelect(entry);
        }
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, filtered, index, onSelect, onClose]);

  if (!open) {
    return null;
  }

  const active = Math.min(index, Math.max(0, filtered.length - 1));

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 p-4 pt-[12vh] backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="w-full max-w-lg overflow-hidden rounded-2xl border border-white/10 bg-shell/85 shadow-glow-accent backdrop-blur-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-white/10 px-5">
          <Search className="size-4 shrink-0 text-zinc-500" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setIndex(0);
            }}
            placeholder="Type a command or sound..."
            aria-label="Type a command or sound"
            className="w-full bg-transparent py-4 text-[15px] text-zinc-100 placeholder:text-zinc-600 focus:outline-none"
          />
          <kbd className="shrink-0 rounded-md border border-white/10 bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-zinc-500">
            esc
          </kbd>
        </div>
        <div className="max-h-80 overflow-y-auto p-2">
          {filtered.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-zinc-500">No matches.</p>
          ) : (
            filtered.map((entry, i) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => onSelect(entry)}
                onMouseEnter={() => setIndex(i)}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${
                  i === active
                    ? "bg-accent-fill/10 text-zinc-50 ring-1 ring-inset ring-accent-fill/30"
                    : "text-zinc-300 hover:bg-white/[0.04]"
                }`}
              >
                <span className="min-w-0 flex-1 truncate">{entry.label}</span>
                {i === active ? (
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
