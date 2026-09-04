"use client";

import { useState } from "react";
import { Check, Folder, Library, Plus, Search, Star, Tags } from "lucide-react";

import { DEMO_COLLECTIONS, VariantFrame } from "./data";

function RailStub({ activeLabel }: { activeLabel: string }) {
  return (
    <div className="flex w-[5.25rem] shrink-0 flex-col items-center gap-1 border-r border-white/10 py-4">
      <div className="mb-4 flex size-10 items-center justify-center rounded-xl bg-accent-fill text-lg font-black text-white shadow-glow-accent-strong">
        F
      </div>
      {[
        { label: "Library", icon: <Library className="size-5" /> },
        { label: "Collections", icon: <Folder className="size-5" /> },
        { label: "Tags", icon: <Tags className="size-5" /> },
        { label: "Favorites", icon: <Star className="size-5" /> },
      ].map((item) => (
        <span
          key={item.label}
          className={`flex w-[4.25rem] flex-col items-center gap-1 rounded-xl border px-1 py-2.5 text-center text-[9px] font-semibold uppercase tracking-[0.1em] ${
            item.label === activeLabel
              ? "border-accent-fill/50 bg-accent-fill/15 text-accent-text shadow-glow-accent"
              : "border-transparent text-zinc-500"
          }`}
        >
          {item.icon}
          {item.label}
        </span>
      ))}
    </div>
  );
}

function CollectionRows({ withChecks = false }: { withChecks?: boolean }) {
  const [picked, setPicked] = useState<string | null>("c1");
  return (
    <div className="space-y-0.5">
      {DEMO_COLLECTIONS.map((collection) => (
        <button
          key={collection.id}
          type="button"
          onClick={() => setPicked(collection.id)}
          className={`flex w-full items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left text-xs transition-colors ${
            picked === collection.id
              ? "border-accent-fill/50 bg-accent-fill/15 font-semibold text-accent-text"
              : "border-transparent font-medium text-zinc-400 hover:bg-white/5 hover:text-zinc-200"
          }`}
        >
          {withChecks ? (
            picked === collection.id ? (
              <Check className="size-3.5 shrink-0 text-accent-text" />
            ) : (
              <span className="size-3.5 shrink-0" />
            )
          ) : null}
          <span className="min-w-0 flex-1 truncate">{collection.name}</span>
          <span className="shrink-0 font-mono text-[10px] tabular-nums text-zinc-600">
            {collection.fileCount}
          </span>
        </button>
      ))}
    </div>
  );
}

function FrameWithRail({
  children,
  height = "h-96",
}: {
  children: React.ReactNode;
  height?: string;
}) {
  return (
    <div
      className={`relative flex ${height} overflow-hidden rounded-xl border border-white/10 bg-canvas`}
    >
      {children}
    </div>
  );
}

export function FlyoutDesigns() {
  const [filterE, setFilterE] = useState("");
  const [sheetOpen, setSheetOpen] = useState(true);
  const visibleE = DEMO_COLLECTIONS.filter((collection) =>
    collection.name.toLowerCase().includes(filterE.trim().toLowerCase()),
  );

  return (
    <div className="space-y-4">
      <VariantFrame
        id="F-A"
        name="Overlay panel"
        note="Current direction: floating card pinned beside the rail."
      >
        <FrameWithRail>
          <RailStub activeLabel="Collections" />
          <div className="min-w-0 flex-1 p-6 text-xs text-zinc-600">
            Library content behind
          </div>
          <div className="absolute bottom-4 left-[6.5rem] top-4 z-10 flex w-60 flex-col overflow-hidden rounded-2xl border border-white/10 bg-shell/95 backdrop-blur-2xl">
            <p className="px-3 pb-1 pt-3 font-mono text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
              Collections
            </p>
            <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto p-2 pt-1">
              <CollectionRows />
            </div>
          </div>
        </FrameWithRail>
      </VariantFrame>

      <VariantFrame
        id="F-B"
        name="Inline expand"
        note="Rail grows a second column; list lives in the sidebar, no overlay."
      >
        <FrameWithRail>
          <RailStub activeLabel="Collections" />
          <div className="flex w-60 shrink-0 flex-col border-r border-white/10 bg-white/[0.02] py-4">
            <p className="px-4 pb-1 font-mono text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
              Collections
            </p>
            <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2">
              <CollectionRows />
            </div>
          </div>
          <div className="min-w-0 flex-1 p-6 text-xs text-zinc-600">
            Library content beside
          </div>
        </FrameWithRail>
      </VariantFrame>

      <VariantFrame
        id="F-C"
        name="Compact menu"
        note="Small popover menu with checks; cheapest visually, fewest cues."
      >
        <FrameWithRail>
          <RailStub activeLabel="Tags" />
          <div className="min-w-0 flex-1 p-6 text-xs text-zinc-600">
            Library content behind
          </div>
          <div className="absolute left-[6.5rem] top-24 z-10 w-56 overflow-hidden rounded-xl border border-white/10 bg-popover/95 p-1 text-popover-foreground shadow-lg backdrop-blur-xl">
            <CollectionRows withChecks />
          </div>
        </FrameWithRail>
      </VariantFrame>

      <VariantFrame
        id="F-D"
        name="Bottom sheet"
        note="Mobile-first: handle, counts, thumb-friendly rows. Try toggling."
      >
        <FrameWithRail height="h-[26rem]">
          <RailStub activeLabel="Collections" />
          <div className="min-w-0 flex-1 p-6 text-xs text-zinc-600">
            Library content behind
          </div>
          <button
            type="button"
            onClick={() => setSheetOpen((open) => !open)}
            className="absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-full border border-white/10 bg-shell/95 px-4 py-1.5 text-xs font-medium text-zinc-300 shadow-lg"
          >
            {sheetOpen ? "Hide collections" : "Browse collections"}
          </button>
          {sheetOpen ? (
            <div className="absolute inset-x-3 bottom-3 top-24 z-10 flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-shell/95 backdrop-blur-2xl">
              <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-white/15" />
              <p className="px-4 pb-1 pt-2 font-mono text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
                Collections · {DEMO_COLLECTIONS.length}
              </p>
              <div className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
                <CollectionRows />
              </div>
            </div>
          ) : null}
        </FrameWithRail>
      </VariantFrame>

      <VariantFrame
        id="F-E"
        name="Filter + actions"
        note="Live search demo: narrows the list, footer owns creation. Try typing."
      >
        <FrameWithRail>
          <RailStub activeLabel="Tags" />
          <div className="min-w-0 flex-1 p-6 text-xs text-zinc-600">
            Library content behind
          </div>
          <div className="absolute bottom-4 left-[6.5rem] top-4 z-10 flex w-64 flex-col overflow-hidden rounded-2xl border border-white/10 bg-shell/95 backdrop-blur-2xl">
            <div className="flex items-center gap-2 border-b border-white/10 px-3">
              <Search className="size-3.5 shrink-0 text-zinc-500" />
              <input
                value={filterE}
                onChange={(event) => setFilterE(event.target.value)}
                placeholder="Filter collections..."
                aria-label="Filter collections"
                className="w-full bg-transparent py-2.5 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none"
              />
            </div>
            <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto p-2">
              {visibleE.length === 0 ? (
                <p className="px-2 py-6 text-center text-xs text-zinc-500">
                  No matches.
                </p>
              ) : (
                visibleE.map((collection) => (
                  <div
                    key={collection.id}
                    className="flex w-full items-center gap-2 rounded-lg border border-transparent px-2.5 py-1.5 text-left text-xs font-medium text-zinc-400"
                  >
                    <span className="min-w-0 flex-1 truncate">
                      {collection.name}
                    </span>
                    <span className="shrink-0 font-mono text-[10px] tabular-nums text-zinc-600">
                      {collection.fileCount}
                    </span>
                  </div>
                ))
              )}
            </div>
            <div className="border-t border-white/10 p-2">
              <span className="flex items-center justify-center gap-1.5 rounded-xl bg-accent-fill px-3 py-2 text-xs font-semibold text-white">
                <Plus className="size-3.5" /> New collection
              </span>
            </div>
          </div>
        </FrameWithRail>
      </VariantFrame>
    </div>
  );
}
