"use client";

import { memo, useEffect, useRef, useState, type Ref } from "react";
import { Search } from "lucide-react";

import { Kbd } from "@/components/variant-i";

// Search input isolated from the workspace root (#259): keystrokes stay in
// this component's own state, and only the settled value crosses into the
// view store, so typing never re-renders the virtualized table, player or
// rails. External value changes (smart collection open, navigation clears)
// resync the draft.

const COMMIT_DELAY_MS = 180;

export const V3SearchField = memo(function V3SearchField({
  value,
  onCommit,
  onOpenPalette,
  fileCount,
  inputRef,
}: {
  value: string;
  onCommit: (value: string) => void;
  onOpenPalette: () => void;
  fileCount: number;
  inputRef?: Ref<HTMLInputElement>;
}) {
  const [draft, setDraft] = useState(value);
  const committedRef = useRef(value);

  useEffect(() => {
    if (value === committedRef.current) return;
    committedRef.current = value;
    setDraft(value);
  }, [value]);

  useEffect(() => {
    if (draft === committedRef.current) return;
    const timer = window.setTimeout(() => {
      committedRef.current = draft;
      onCommit(draft);
    }, COMMIT_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [draft, onCommit]);

  return (
    <div className="relative flex flex-1 items-center">
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-500" />
      <input
        ref={inputRef}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        placeholder="Search sounds by name, tag, or format…"
        aria-label="Search sounds"
        className="h-10 w-full min-w-0 rounded-lg border border-(--vi-edge) bg-(--vi-well) pl-9 pr-36 text-[13px] text-zinc-100 shadow-(--vi-sink) outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-zinc-600 hover:border-(--vi-edge-hi) focus:border-[color-mix(in_oklab,var(--accent-fill)_60%,transparent)] focus:shadow-[var(--vi-sink),0_0_16px_color-mix(in_oklab,var(--accent-fill)_10%,transparent)] motion-reduce:transition-none"
      />
      {draft && (
        <button
          type="button"
          onClick={() => {
            committedRef.current = "";
            setDraft("");
            onCommit("");
          }}
          className="absolute right-24 top-1/2 -translate-y-1/2 shrink-0 rounded-md px-2 py-1 font-mono text-[11px] text-zinc-500 hover:text-zinc-100"
        >
          Clear
        </button>
      )}
      <button
        type="button"
        onClick={onOpenPalette}
        aria-label="Open command palette"
        title="Command palette (Ctrl+K)"
        className="absolute right-2.5 top-1/2 hidden -translate-y-1/2 shrink-0 items-center gap-1.5 rounded-md border border-(--vi-edge-hi) bg-[linear-gradient(180deg,rgba(255,255,255,0.07),rgba(255,255,255,0.02))] px-1.5 py-0.5 font-mono text-[10px] text-zinc-400 shadow-(--vi-lift) sm:flex"
      >
        <Kbd>⌘</Kbd>
        <Kbd>K</Kbd>
        <span className="ml-1 text-zinc-600">{fileCount}</span>
      </button>
    </div>
  );
});
