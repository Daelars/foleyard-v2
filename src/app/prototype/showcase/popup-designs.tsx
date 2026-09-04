"use client";

import { Check, Copy, FilePlus2, FolderPlus, Heart, PackagePlus, Puzzle, Tags, Trash2, X } from "lucide-react";

import { DEMO_COLLECTIONS, DEMO_TAGS, VariantFrame } from "./data";

function MenuShell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="w-60 overflow-hidden rounded-2xl border border-white/10 bg-shell/95 p-1.5 shadow-glow-accent backdrop-blur-2xl">
      <p className="px-2.5 pb-1 pt-1.5 font-mono text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
        {label}
      </p>
      {children}
    </div>
  );
}

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

export function PopupDesigns() {
  return (
    <div className="space-y-4">
      <VariantFrame id="M-A" name="Collection menu" note="Add-to-collection in the quiet language, with empty state + create action.">
        <div className="flex flex-wrap items-start gap-6">
          <MenuShell label="Collections">
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
          </MenuShell>

          <MenuShell label="Collections">
            <p className="px-2.5 py-4 text-center text-xs text-zinc-500">No collections yet.</p>
            <div className="my-1 h-px bg-white/5" />
            <MenuItem>
              <FilePlus2 className="size-4 shrink-0 text-zinc-500" />
              New collection…
            </MenuItem>
          </MenuShell>
        </div>
      </VariantFrame>

      <VariantFrame id="M-B" name="Row context menu" note="Right-click menu with tag submenu peek and shelf section.">
        <div className="flex flex-wrap items-start gap-6">
          <MenuShell label="rain-loop.wav">
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
          </MenuShell>

          <MenuShell label="Tags">
            {DEMO_TAGS.slice(0, 4).map((tag, i) => (
              <MenuItem key={tag.id} active={i < 2}>
                {i < 2 ? (
                  <Check className="size-4 shrink-0 text-accent-text" />
                ) : (
                  <span className="size-4 shrink-0" />
                )}
                <span
                  className="size-2 shrink-0 rounded-full"
                  style={{ backgroundColor: tag.color }}
                />
                <span className="min-w-0 flex-1 truncate">{tag.name}</span>
              </MenuItem>
            ))}
            <div className="my-1 h-px bg-white/5" />
            <MenuItem>
              <Heart className="size-4 shrink-0 text-zinc-500" />
              Save to favorites
            </MenuItem>
            <MenuItem destructive>
              <Trash2 className="size-4 shrink-0" />
              Remove from library
            </MenuItem>
          </MenuShell>
        </div>
      </VariantFrame>

      <VariantFrame id="M-C" name="Remove confirm" note="Destructive confirm in the same language: radio options, friendly words.">
        <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-shell/95 p-6 shadow-glow-accent backdrop-blur-2xl">
          <p className="text-lg font-extrabold tracking-tight text-zinc-50">Remove 3 sounds?</p>
          <div className="mt-4 space-y-2">
            <span className="block w-full rounded-xl border border-accent-fill/60 bg-accent-fill/10 p-3">
              <span className="block text-sm font-semibold text-zinc-100">Remove from library</span>
              <span className="mt-0.5 block text-xs text-zinc-500">
                Sounds no longer appear in Foleyard. Files on disk are untouched.
              </span>
            </span>
            <span className="block w-full rounded-xl border border-white/10 bg-white/[0.02] p-3">
              <span className="block text-sm font-semibold text-zinc-100">Delete from disk</span>
              <span className="mt-0.5 block text-xs text-zinc-500">
                Permanently delete 3 sounds from disk. This cannot be undone.
              </span>
            </span>
          </div>
          <div className="mt-6 flex justify-end gap-2">
            <span className="rounded-xl px-4 py-2 text-sm font-medium text-zinc-400">Cancel</span>
            <span className="flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2 text-sm font-semibold text-zinc-100">
              <Trash2 className="size-4" /> Remove from library
            </span>
          </div>
        </div>
      </VariantFrame>
    </div>
  );
}
