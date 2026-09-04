"use client";

import { Check, Copy, FilePlus2, FolderPlus, PackagePlus, Puzzle, Tags, Trash2, X } from "lucide-react";

import { DEMO_COLLECTIONS, DEMO_TAGS, VariantFrame } from "../showcase/data";
import { AppBackdrop } from "./shared";

function MenuItem({
  active = false,
  destructive = false,
  children,
}: {
  active?: boolean;
  destructive?: boolean;
  children: React.ReactNode;
}) {
  return (
    <span
      className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] transition-colors ${
        destructive
          ? "font-medium text-zinc-400 hover:bg-destructive/10 hover:text-destructive"
          : active
            ? "bg-accent-fill/10 font-semibold text-zinc-50 ring-1 ring-inset ring-accent-fill/30"
            : "font-medium text-zinc-300 hover:bg-white/[0.04]"
      }`}
    >
      {children}
    </span>
  );
}

export function PopupsV2() {
  return (
    <VariantFrame
      id="V2-M"
      name="Popups in quiet language"
      note="Exact recipe as the revised palette: shell/85, hairline border, soft glow. No white borders."
    >
      <AppBackdrop>
        <div className="flex flex-wrap items-start justify-center gap-6">
          <div className="w-60 overflow-hidden rounded-2xl border border-white/10 bg-shell/85 p-1.5 shadow-glow-accent backdrop-blur-2xl">
            <p className="px-2.5 pb-1 pt-1.5 font-mono text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
              Collections
            </p>
            {DEMO_COLLECTIONS.slice(0, 3).map((collection, i) => (
              <MenuItem key={collection.id} active={i === 0}>
                <FolderPlus className="size-4 shrink-0 text-zinc-500" />
                <span className="min-w-0 flex-1 truncate">{collection.name}</span>
                <span className="shrink-0 font-mono text-[10px] tabular-nums text-zinc-600">
                  {collection.fileCount}
                </span>
              </MenuItem>
            ))}
            <div className="my-1 h-px bg-white/5" />
            <MenuItem>
              <FilePlus2 className="size-4 shrink-0 text-zinc-500" />
              New collection…
            </MenuItem>
          </div>

          <div className="flex items-start gap-3">
            <div className="w-60 overflow-hidden rounded-2xl border border-white/10 bg-shell/85 p-1.5 shadow-glow-accent backdrop-blur-2xl">
              <p className="px-2.5 pb-1 pt-1.5 font-mono text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
                rain-loop.wav
              </p>
              <MenuItem>
                <Copy className="size-4 shrink-0 text-zinc-500" />
                Copy path
              </MenuItem>
              <MenuItem active>
                <Tags className="size-4 shrink-0 text-zinc-500" />
                <span className="min-w-0 flex-1 truncate">Tags</span>
                <span className="font-mono text-[10px] text-zinc-600">→</span>
              </MenuItem>
              <MenuItem>
                <PackagePlus className="size-4 shrink-0 text-zinc-500" />
                Make Pack
              </MenuItem>
              <div className="my-1 h-px bg-white/5" />
              <MenuItem>
                <Puzzle className="size-4 shrink-0 text-zinc-500" />
                Add to Shelf
              </MenuItem>
              <MenuItem destructive>
                <X className="size-4 shrink-0" />
                Remove from Shelf
              </MenuItem>
            </div>

            <div className="w-52 overflow-hidden rounded-2xl border border-white/10 bg-shell/85 p-1.5 shadow-glow-accent backdrop-blur-2xl">
              <p className="px-2.5 pb-1 pt-1.5 font-mono text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
                Tags
              </p>
              {DEMO_TAGS.slice(0, 4).map((tag, i) => (
                <MenuItem key={tag.id} active={i < 2}>
                  {i < 2 ? (
                    <Check className="size-4 shrink-0 text-accent-text" />
                  ) : (
                    <span className="size-4 shrink-0" />
                  )}
                  <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: tag.color }} />
                  <span className="min-w-0 flex-1 truncate">{tag.name}</span>
                </MenuItem>
              ))}
              <div className="my-1 h-px bg-white/5" />
              <MenuItem destructive>
                <Trash2 className="size-4 shrink-0" />
                Remove from library
              </MenuItem>
            </div>
          </div>
        </div>
      </AppBackdrop>
    </VariantFrame>
  );
}
