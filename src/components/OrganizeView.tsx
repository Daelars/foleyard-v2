"use client";

import { useState } from "react";
import { ChevronDown, Pencil, Plus, Trash2, X } from "lucide-react";

import { ITEM_COLOR_PRESETS, onColorText } from "@/lib/item-colors";

const FEATHER_MASK = {
  WebkitMaskImage: "radial-gradient(100% 100% at 50% 50%, black 38%, transparent 98%)",
  maskImage: "radial-gradient(100% 100% at 50% 50%, black 38%, transparent 98%)",
} as const;

export type OrganizeCollection = {
  id: string;
  name: string;
  fileCount?: number;
  color?: string | null;
  isSmart?: boolean;
};

export type OrganizeTag = {
  id: string;
  name: string;
  color: string;
};

function Swatches({
  value,
  onPick,
}: {
  value: string;
  onPick: (color: string) => void;
}) {
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      {ITEM_COLOR_PRESETS.map((color) => (
        <button
          key={color}
          type="button"
          onClick={() => onPick(color)}
          aria-label={`Pick ${color}`}
          style={{ backgroundColor: color }}
          className={`size-5 rounded-full transition-transform hover:scale-110 active:scale-95 ${
            value === color
              ? "ring-2 ring-white ring-offset-2 ring-offset-black"
              : "opacity-70 hover:opacity-100"
          }`}
        />
      ))}
    </span>
  );
}

export function OrganizeView({
  collections,
  tags,
  selectedTagId,
  onOpenCollection,
  onCreateCollection,
  onRenameCollection,
  onDeleteCollection,
  onUpdateCollectionColor,
  onCreateTag,
  onRenameTag,
  onDeleteTag,
  onUpdateTagColor,
  onSelectTag,
}: {
  collections: OrganizeCollection[];
  tags: OrganizeTag[];
  selectedTagId: string | null;
  onOpenCollection: (id: string) => void;
  onCreateCollection: (name: string, color: string) => Promise<string | null>;
  onRenameCollection: (id: string, name: string) => Promise<void>;
  onDeleteCollection: (id: string) => void;
  onUpdateCollectionColor: (id: string, color: string) => void;
  onCreateTag: (name: string, color: string) => Promise<string | null>;
  onRenameTag: (id: string, name: string) => Promise<void>;
  onDeleteTag: (id: string) => void;
  onUpdateTagColor: (id: string, color: string) => void;
  onSelectTag: (id: string | null) => void;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showComposer, setShowComposer] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(ITEM_COLOR_PRESETS[0]);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [showTagComposer, setShowTagComposer] = useState(false);
  const [tagName, setTagName] = useState("");
  const [tagColor, setTagColor] = useState(ITEM_COLOR_PRESETS[4]);
  const [editingTag, setEditingTag] = useState<string | null>(null);
  const [tagDraft, setTagDraft] = useState("");
  const [confirmTagDelete, setConfirmTagDelete] = useState(false);

  const createCollection = () => {
    const name = newName.trim();
    if (!name) {
      return;
    }
    onCreateCollection(name, newColor).then((id) => {
      if (id) {
        setExpanded(id);
      }
    });
    setNewName("");
    setNewColor(ITEM_COLOR_PRESETS[0]);
    setShowComposer(false);
  };

  const commitRename = () => {
    if (renamingId && renameDraft.trim()) {
      void onRenameCollection(renamingId, renameDraft.trim());
    }
    setRenamingId(null);
  };

  const createTag = () => {
    const name = tagName.trim();
    if (!name) {
      return;
    }
    onCreateTag(name, tagColor).then((id) => {
      if (id) {
        onSelectTag(id);
        setEditingTag(id);
        setTagDraft(name);
      }
    });
    setTagName("");
    setTagColor(ITEM_COLOR_PRESETS[4]);
    setShowTagComposer(false);
    setConfirmTagDelete(false);
  };

  const commitTagRename = () => {
    if (editingTag && tagDraft.trim()) {
      void onRenameTag(editingTag, tagDraft.trim());
    }
  };

  return (
    <div className="px-4 pb-4 md:px-5">
      <div className="flex items-center gap-2">
        <p className="font-mono text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
          Tags
        </p>
        <button
          type="button"
          onClick={() => setShowTagComposer((show) => !show)}
          aria-label="New tag"
          className="flex size-5 items-center justify-center rounded-full border border-dashed border-white/20 text-zinc-500 transition-all hover:border-accent-fill/60 hover:text-accent-text active:scale-90"
        >
          <Plus className="size-3" />
        </button>
      </div>
      <div className="mt-1.5 flex flex-wrap items-start gap-1.5">
        {tags.map((tag) => {
          const active = selectedTagId === tag.id;
          if (editingTag === tag.id) {
            return (
              <span
                key={tag.id}
                className="w-full max-w-md animate-in rounded-2xl border border-accent-fill/50 bg-accent-fill/[0.07] p-2 fade-in-0 zoom-in-95 duration-200"
              >
                <span className="flex items-center gap-2">
                  <span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: tag.color }} />
                  <input
                    autoFocus
                    value={tagDraft}
                    onChange={(event) => setTagDraft(event.target.value)}
                    onBlur={commitTagRename}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        commitTagRename();
                        setEditingTag(null);
                      }
                      if (event.key === "Escape") {
                        setEditingTag(null);
                      }
                    }}
                    aria-label="Rename tag"
                    className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/30 px-2 py-1 text-xs font-semibold text-zinc-100 focus:border-accent-fill/60 focus:outline-none"
                  />
                  {confirmTagDelete ? (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          onDeleteTag(tag.id);
                          setEditingTag(null);
                          setConfirmTagDelete(false);
                        }}
                        className="shrink-0 rounded-lg bg-destructive/15 px-2.5 py-1 text-xs font-semibold text-destructive transition-all hover:bg-destructive/25 active:scale-95"
                      >
                        Sure?
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmTagDelete(false)}
                        aria-label="Cancel delete"
                        className="flex size-6 shrink-0 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-white/5 hover:text-zinc-100"
                      >
                        <X className="size-3" />
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => setConfirmTagDelete(true)}
                        aria-label={`Delete tag ${tag.name}`}
                        className="flex size-6 shrink-0 items-center justify-center rounded-lg text-zinc-600 transition-all hover:bg-destructive/10 hover:text-destructive active:scale-90"
                      >
                        <Trash2 className="size-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingTag(null)}
                        aria-label="Done editing"
                        className="flex size-6 shrink-0 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-white/5 hover:text-zinc-100"
                      >
                        <X className="size-3" />
                      </button>
                    </>
                  )}
                </span>
                <span className="mt-1.5 flex items-center gap-2 px-1 pb-0.5">
                  <Swatches value={tag.color} onPick={(next) => onUpdateTagColor(tag.id, next)} />
                </span>
              </span>
            );
          }
          return (
            <button
              key={tag.id}
              type="button"
              onClick={() => onSelectTag(active ? null : tag.id)}
              onDoubleClick={() => {
                setEditingTag(tag.id);
                setTagDraft(tag.name);
                setConfirmTagDelete(false);
              }}
              title="Click to filter · double-click to edit"
              style={active ? { borderColor: `${tag.color}80`, backgroundColor: `${tag.color}14` } : undefined}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-all active:scale-95 ${
                active ? "border" : "border-white/10 bg-white/[0.04] text-zinc-300 hover:bg-white/[0.06]"
              }`}
            >
              <span className="size-2 rounded-full" style={{ backgroundColor: tag.color }} />
              {tag.name}
            </button>
          );
        })}
      </div>

      {showTagComposer ? (
        <div className="mt-2 max-w-md animate-in rounded-2xl border border-dashed border-white/20 p-3 fade-in-0 zoom-in-95 duration-200">
          <div className="flex items-center gap-2">
            <input
              autoFocus
              value={tagName}
              onChange={(event) => setTagName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  createTag();
                }
                if (event.key === "Escape") {
                  setShowTagComposer(false);
                }
              }}
              placeholder="Tag name…"
              aria-label="New tag name"
              className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm font-semibold text-zinc-100 placeholder:font-normal placeholder:text-zinc-600 focus:border-accent-fill/60 focus:outline-none"
            />
            <Swatches value={tagColor} onPick={setTagColor} />
          </div>
          <div className="mt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowTagComposer(false)}
              className="rounded-xl px-4 py-2 text-xs font-medium text-zinc-400 transition-colors hover:text-zinc-100"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={createTag}
              disabled={!tagName.trim()}
              className="rounded-xl px-4 py-2 text-xs font-semibold transition-all active:scale-95 disabled:opacity-40"
              style={{ backgroundColor: tagColor, color: onColorText(tagColor) }}
            >
              Add tag
            </button>
          </div>
        </div>
      ) : null}

      <div className="mt-3 space-y-2">
        {collections.map((collection, i) => {
          const color = collection.color ?? "#f0503c";
          const open = expanded === collection.id;
          const renaming = renamingId === collection.id;
          const confirming = confirmDeleteId === collection.id;
          return (
            <div
              key={collection.id}
              style={{
                backgroundColor: `${color}0d`,
                backgroundImage: `linear-gradient(100deg, ${color}30, transparent 65%)`,
                animationDelay: `${Math.min(i, 8) * 45}ms`,
              }}
              className="relative animate-in overflow-hidden rounded-2xl border border-white/10 fade-in-0 slide-in-from-bottom-2 duration-300"
            >
              <span
                aria-hidden="true"
                className="pointer-events-none absolute -right-2 -top-6 select-none text-[92px] font-black leading-none tracking-tighter"
                style={{ color: `${color}26` }}
              >
                {collection.name.slice(0, 2).toUpperCase()}
              </span>
              <button
                type="button"
                onClick={() => {
                  setExpanded(open ? null : collection.id);
                  setConfirmDeleteId(null);
                }}
                aria-expanded={open}
                className="relative flex w-full items-center gap-3 p-4 text-left transition-transform active:scale-[0.99]"
              >
                <span className="min-w-0 flex-1">
                  {renaming ? (
                    <span
                      className="block"
                      onClick={(event) => event.stopPropagation()}
                      onMouseDown={(event) => event.stopPropagation()}
                    >
                      <input
                        autoFocus
                        value={renameDraft}
                        onChange={(event) => setRenameDraft(event.target.value)}
                        onBlur={commitRename}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            commitRename();
                          }
                          if (event.key === "Escape") {
                            setRenamingId(null);
                          }
                        }}
                        aria-label="Rename collection"
                        className="w-full rounded-lg border border-accent-fill/60 bg-black/40 px-2 py-1 text-base font-bold tracking-tight text-zinc-50 focus:outline-none"
                      />
                    </span>
                  ) : (
                    <>
                      <span className="block truncate text-base font-bold tracking-tight text-zinc-50">
                        {collection.name}
                        {collection.isSmart ? (
                          <span className="ml-2 rounded border border-white/15 px-1.5 py-0.5 align-middle font-mono text-[10px] font-normal uppercase tracking-widest text-zinc-500">
                            Smart
                          </span>
                        ) : null}
                      </span>
                      <span className="mt-0.5 block font-mono text-[10px] uppercase tracking-widest text-zinc-400">
                        {collection.fileCount ?? 0} sounds
                      </span>
                    </>
                  )}
                </span>
                <ChevronDown
                  className={`size-4 shrink-0 text-zinc-400 transition-transform duration-300 ${open ? "rotate-180" : ""}`}
                />
              </button>
              <div
                className={`relative grid transition-all duration-300 ease-out ${
                  open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                }`}
              >
                <div className="overflow-hidden">
                  <div className="px-4 pb-3">
                    {confirming ? (
                      <div className="flex items-center gap-2 rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2.5">
                        <span className="min-w-0 flex-1 truncate text-xs font-medium text-zinc-200">
                          Delete “{collection.name}”? Files stay on disk.
                        </span>
                        <button
                          type="button"
                          onClick={() => onDeleteCollection(collection.id)}
                          className="shrink-0 rounded-lg bg-destructive/20 px-3 py-1.5 text-xs font-semibold text-destructive transition-all hover:bg-destructive/30 active:scale-95"
                        >
                          Sure?
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(null)}
                          className="shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium text-zinc-400 transition-colors hover:text-zinc-100"
                        >
                          Keep
                        </button>
                      </div>
                    ) : (
                      <div
                        className="rounded-xl bg-black/60 px-2 py-1 backdrop-blur-md"
                        style={FEATHER_MASK}
                      >
                        <div className="flex items-center gap-1.5 px-2 pb-2 pt-1">
                          <Swatches
                            value={color}
                            onPick={(next) => onUpdateCollectionColor(collection.id, next)}
                          />
                          <span className="flex-1" />
                          <button
                            type="button"
                            onClick={() => {
                              setRenamingId(collection.id);
                              setRenameDraft(collection.name);
                            }}
                            aria-label={`Rename ${collection.name}`}
                            className="flex size-8 items-center justify-center rounded-lg text-zinc-500 transition-all hover:bg-white/5 hover:text-zinc-100 active:scale-90"
                          >
                            <Pencil className="size-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(collection.id)}
                            aria-label={`Delete ${collection.name}`}
                            className="flex size-8 items-center justify-center rounded-lg text-zinc-500 transition-all hover:bg-destructive/10 hover:text-destructive active:scale-90"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onOpenCollection(collection.id)}
                            className="shrink-0 rounded-xl px-3.5 py-2 text-xs font-semibold transition-transform active:scale-95"
                            style={{ backgroundColor: color, color: onColorText(color) }}
                          >
                            Open
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {showComposer ? (
        <div className="mt-2 animate-in rounded-2xl border border-dashed border-white/20 p-4 fade-in-0 zoom-in-95 duration-200">
          <div className="flex items-center gap-3">
            <input
              autoFocus
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  createCollection();
                }
                if (event.key === "Escape") {
                  setShowComposer(false);
                }
              }}
              placeholder="Collection name…"
              aria-label="New collection name"
              className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm font-semibold text-zinc-100 placeholder:font-normal placeholder:text-zinc-600 focus:border-accent-fill/60 focus:outline-none"
            />
            <Swatches value={newColor} onPick={setNewColor} />
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowComposer(false)}
              className="rounded-xl px-4 py-2 text-xs font-medium text-zinc-400 transition-colors hover:text-zinc-100"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={createCollection}
              disabled={!newName.trim()}
              className="rounded-xl px-4 py-2 text-xs font-semibold transition-all active:scale-95 disabled:opacity-40"
              style={{ backgroundColor: newColor, color: onColorText(newColor) }}
            >
              Create collection
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => {
            setNewName("");
            setNewColor(ITEM_COLOR_PRESETS[0]);
            setShowComposer(true);
          }}
          className="mt-2 flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-white/15 py-3 text-xs font-semibold text-zinc-500 transition-all hover:border-accent-fill/50 hover:text-accent-text active:scale-[0.99]"
        >
          <Plus className="size-3.5" /> New collection
        </button>
      )}
    </div>
  );
}
