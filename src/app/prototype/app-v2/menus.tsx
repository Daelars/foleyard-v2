"use client";

import { useEffect } from "react";
import {
  Check,
  Copy,
  FilePlus2,
  FolderPlus,
  PackagePlus,
  Puzzle,
  Tags,
  Trash2,
  X,
} from "lucide-react";
function MenuShell({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="w-60 overflow-hidden rounded-2xl border border-white/10 bg-shell/85 p-1.5 shadow-glow-accent backdrop-blur-2xl">
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
  onClick,
  children,
}: {
  active?: boolean;
  destructive?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] transition-colors ${
        destructive
          ? "font-medium text-zinc-400 hover:bg-destructive/10 hover:text-destructive"
          : active
            ? "bg-accent-fill/10 font-semibold text-zinc-50 ring-1 ring-inset ring-accent-fill/30"
            : "font-medium text-zinc-300 hover:bg-white/[0.04]"
      }`}
    >
      {children}
    </button>
  );
}

export type MockCollection = { id: string; name: string; fileCount: number };

export function CollectionMenu({
  collections,
  onPick,
  onNew,
  onClose,
}: {
  collections: MockCollection[];
  onPick: (id: string) => void;
  onNew: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <>
      <button
        type="button"
        aria-label="Close menu"
        onClick={onClose}
        className="fixed inset-0 z-40 cursor-default bg-transparent"
      />
      <div className="fixed bottom-24 right-6 z-50">
        <MenuShell label="Collections">
          {collections.length === 0 ? (
            <p className="px-2.5 py-4 text-center text-xs text-zinc-500">No collections yet.</p>
          ) : (
            collections.map((collection) => (
              <MenuItem key={collection.id} onClick={() => onPick(collection.id)}>
                <FolderPlus className="size-4 shrink-0 text-zinc-500" />
                <span className="min-w-0 flex-1 truncate">{collection.name}</span>
                <span className="shrink-0 font-mono text-[10px] tabular-nums text-zinc-600">
                  {collection.fileCount}
                </span>
              </MenuItem>
            ))
          )}
          <div className="my-1 h-px bg-white/5" />
          <MenuItem onClick={onNew}>
            <FilePlus2 className="size-4 shrink-0 text-zinc-500" />
            New collection…
          </MenuItem>
        </MenuShell>
      </div>
    </>
  );
}

export function RowMenu({
  x,
  y,
  filename,
  tags,
  fileTags,
  inShelf,
  onToggleTag,
  onCopyPath,
  onMakePack,
  onToggleShelf,
  onToggleFavorite,
  isFavorite,
  onRemove,
  onClose,
}: {
  x: number;
  y: number;
  filename: string;
  tags: { id: string; name: string; color: string }[];
  fileTags: string[];
  inShelf: boolean;
  onToggleTag: (tagId: string) => void;
  onCopyPath: () => void;
  onMakePack: () => void;
  onToggleShelf: () => void;
  onToggleFavorite: () => void;
  isFavorite: boolean;
  onRemove: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <>
      <button
        type="button"
        aria-label="Close menu"
        onClick={onClose}
        onContextMenu={(event) => {
          event.preventDefault();
          onClose();
        }}
        className="fixed inset-0 z-40 cursor-default bg-transparent"
      />
      <div className="fixed z-50" style={{ left: Math.min(x, window.innerWidth - 260), top: Math.min(y, window.innerHeight - 380) }}>
        <MenuShell label={filename}>
          <MenuItem onClick={onCopyPath}>
            <Copy className="size-4 shrink-0 text-zinc-500" />
            Copy path
          </MenuItem>
          <MenuItem onClick={onToggleFavorite}>
            <FolderPlus className="size-4 shrink-0 text-zinc-500" />
            {isFavorite ? "Unsave" : "Save to favorites"}
          </MenuItem>
          <MenuItem onClick={onMakePack}>
            <PackagePlus className="size-4 shrink-0 text-zinc-500" />
            Make Pack
          </MenuItem>
          <div className="my-1 h-px bg-white/5" />
          <MenuItem onClick={onToggleShelf}>
            {inShelf ? (
              <X className="size-4 shrink-0 text-zinc-500" />
            ) : (
              <Puzzle className="size-4 shrink-0 text-zinc-500" />
            )}
            {inShelf ? "Remove from Shelf" : "Add to Shelf"}
          </MenuItem>
          <div className="my-1 h-px bg-white/5" />
          <p className="px-2.5 pb-1 pt-1.5 font-mono text-[10px] font-semibold uppercase tracking-widest text-zinc-600">
            <span className="inline-flex items-center gap-1.5">
              <Tags className="size-3" /> Tags
            </span>
          </p>
          {tags.map((tag) => {
            const on = fileTags.includes(tag.id);
            return (
              <MenuItem key={tag.id} active={on} onClick={() => onToggleTag(tag.id)}>
                {on ? (
                  <Check className="size-4 shrink-0 text-accent-text" />
                ) : (
                  <span className="size-4 shrink-0" />
                )}
                <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: tag.color }} />
                <span className="min-w-0 flex-1 truncate">{tag.name}</span>
              </MenuItem>
            );
          })}
          <div className="my-1 h-px bg-white/5" />
          <MenuItem destructive onClick={onRemove}>
            <Trash2 className="size-4 shrink-0" />
            Remove from library
          </MenuItem>
        </MenuShell>
      </div>
    </>
  );
}
