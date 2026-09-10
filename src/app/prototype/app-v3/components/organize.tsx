"use client";

// app-v3 adapter for OrganizeView: same tags/collections workflows
// (create, rename, color, delete with arm-confirm, filter), I treatment —
// tag chips/editor/composer from the library, collections as color-tinted
// disclosure rows in I geometry.
import { useState } from "react";
import { ChevronDown, Pencil, Plus, Trash2, X } from "lucide-react";

import {
  Button,
  ColorSwatch,
  NewTagButton,
  TagComposer,
  TagEditor,
} from "@/components/variant-i";
import { ITEM_COLOR_PRESETS, onColorText, resolveItemColor } from "@/lib/item-colors";
import { cn } from "@/lib/utils";

import type {
  CollectionsSectionProps,
  OrganizeViewProps,
  TagsSectionProps,
} from "@/components/organize/types";
import {
  isTagDeleteArmed,
  switchEditingTag,
} from "@/components/organize/tag-confirm";
import { isComposerNameValid } from "@/components/organize/name-color-composer";
import { resolveCollectionCount } from "@/components/organize/collections-section";

export type {
  OrganizeCollection,
  OrganizeTag,
  OrganizeViewProps,
} from "@/components/organize/types";

export function V3OrganizeView({
  collections,
  tags,
  selectedTagId,
  smartCounts,
  onOpenCollection,
  onRequestSmartCount,
  onCreateCollection,
  onRenameCollection,
  onDeleteCollection,
  onUpdateCollectionColor,
  onCreateTag,
  onRenameTag,
  onDeleteTag,
  onUpdateTagColor,
  onSelectTag,
}: OrganizeViewProps) {
  return (
    <div className="px-4 pb-4 md:px-5">
      <V3TagsSection
        tags={tags}
        selectedTagId={selectedTagId}
        onCreateTag={onCreateTag}
        onRenameTag={onRenameTag}
        onDeleteTag={onDeleteTag}
        onUpdateTagColor={onUpdateTagColor}
        onSelectTag={onSelectTag}
      />
      <V3CollectionsSection
        collections={collections}
        smartCounts={smartCounts}
        onOpenCollection={onOpenCollection}
        onRequestSmartCount={onRequestSmartCount}
        onCreateCollection={onCreateCollection}
        onRenameCollection={onRenameCollection}
        onDeleteCollection={onDeleteCollection}
        onUpdateCollectionColor={onUpdateCollectionColor}
      />
    </div>
  );
}

function V3TagsSection({
  tags,
  selectedTagId,
  onCreateTag,
  onRenameTag,
  onDeleteTag,
  onUpdateTagColor,
  onSelectTag,
}: TagsSectionProps) {
  const [showTagComposer, setShowTagComposer] = useState(false);
  const [tagName, setTagName] = useState("");
  const [tagColor, setTagColor] = useState(ITEM_COLOR_PRESETS[4]);
  const [editingTag, setEditingTag] = useState<string | null>(null);
  const [tagDraft, setTagDraft] = useState("");
  const [confirmTagDeleteId, setConfirmTagDeleteId] = useState<string | null>(
    null,
  );

  const createTag = () => {
    const name = tagName.trim();
    if (!isComposerNameValid(tagName)) {
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
    setConfirmTagDeleteId(null);
  };

  const commitTagRename = () => {
    if (editingTag && tagDraft.trim()) {
      void onRenameTag(editingTag, tagDraft.trim());
    }
  };

  return (
    <div>
      <div className="flex items-center gap-2">
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
          Tags
        </p>
        <NewTagButton open={showTagComposer} onClick={() => setShowTagComposer((show) => !show)} />
      </div>
      <div className="mt-1.5 flex flex-wrap items-start gap-1.5">
        {tags.map((tag) => {
          const active = selectedTagId === tag.id;
          if (editingTag === tag.id) {
            return (
              <TagEditor
                key={tag.id}
                name={tagDraft}
                color={tag.color}
                armed={isTagDeleteArmed(confirmTagDeleteId, tag.id)}
                onNameChange={setTagDraft}
                onColorChange={(next) => onUpdateTagColor(tag.id, next)}
                onCommit={() => {
                  commitTagRename();
                  setEditingTag(null);
                }}
                onCancel={() => setEditingTag(null)}
                onDelete={() => {
                  onDeleteTag(tag.id);
                  setEditingTag(null);
                  setConfirmTagDeleteId(null);
                }}
                onArmDelete={() => setConfirmTagDeleteId(tag.id)}
                onDeleteCancel={() => setConfirmTagDeleteId(null)}
              />
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
                setConfirmTagDeleteId(switchEditingTag());
              }}
              title="Click to filter · double-click to edit"
              aria-pressed={active}
              style={active ? { borderColor: `${tag.color}80`, backgroundColor: `${tag.color}14` } : undefined}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold outline-none transition-[background-color,border-color,transform] duration-150 motion-safe:active:scale-95",
                "focus-visible:ring-2 focus-visible:ring-[var(--vi-focus)]",
                active
                  ? "text-zinc-100"
                  : "border-[var(--vi-edge)] bg-white/[0.04] text-zinc-300 hover:bg-white/[0.06]",
              )}
            >
              <span className="size-2 rounded-full" style={{ backgroundColor: tag.color }} />
              {tag.name}
            </button>
          );
        })}
      </div>

      {showTagComposer ? (
        <TagComposer
          name={tagName}
          color={tagColor}
          onNameChange={setTagName}
          onColorChange={setTagColor}
          onSubmit={createTag}
          onCancel={() => setShowTagComposer(false)}
        />
      ) : null}
    </div>
  );
}

function V3CollectionsSection({
  collections,
  smartCounts,
  onOpenCollection,
  onRequestSmartCount,
  onCreateCollection,
  onRenameCollection,
  onDeleteCollection,
  onUpdateCollectionColor,
}: CollectionsSectionProps) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showComposer, setShowComposer] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(ITEM_COLOR_PRESETS[0]);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const createCollection = () => {
    const name = newName.trim();
    if (!isComposerNameValid(newName)) {
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

  return (
    <div className="mt-3 space-y-2">
      {collections.map((collection) => {
        const color = resolveItemColor(collection.name, collection.color);
        const open = expanded === collection.id;
        const renaming = renamingId === collection.id;
        const confirming = confirmDeleteId === collection.id;
        return (
          <div
            key={collection.id}
            style={{
              backgroundColor: `${color}0d`,
              backgroundImage: `linear-gradient(100deg, ${color}30, transparent 65%)`,
            }}
            className="relative overflow-hidden rounded-lg border border-[var(--vi-edge)] transition-colors hover:border-[var(--vi-edge-hi)]"
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
                if (!open && collection.isSmart) {
                  onRequestSmartCount?.(collection.id);
                }
              }}
              aria-expanded={open}
              className="relative flex w-full items-center gap-3 p-4 text-left outline-none transition-transform motion-safe:active:scale-[0.99] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--vi-focus)]"
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
                      className="w-full rounded-md border border-[color-mix(in_oklab,var(--accent-fill)_60%,transparent)] bg-[rgba(0,0,0,0.38)] px-2 py-1 text-base font-bold tracking-tight text-zinc-50 outline-none"
                    />
                  </span>
                ) : (
                  <>
                    <span className="block truncate text-base font-bold tracking-tight text-zinc-50">
                      {collection.name}
                      {collection.isSmart ? (
                        <span className="ml-2 rounded border border-[var(--vi-edge)] px-1.5 py-0.5 align-middle font-mono text-[10px] font-normal uppercase tracking-widest text-zinc-500">
                          Smart
                        </span>
                      ) : null}
                    </span>
                    <span className="mt-0.5 block font-mono text-[10px] uppercase tracking-widest text-zinc-400">
                      {resolveCollectionCount(
                        collection,
                        smartCounts,
                        collection.id,
                      )}{" "}
                      sounds
                    </span>
                  </>
                )}
              </span>
              <ChevronDown
                aria-hidden
                className={cn(
                  "size-4 shrink-0 text-zinc-500 transition-transform duration-200 motion-reduce:transition-none",
                  open && "rotate-180 text-accent-text",
                )}
              />
            </button>
            <div
              className={cn(
                "relative grid transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:transition-none",
                open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
              )}
            >
              <div className="overflow-hidden">
                <div className="px-4 pb-3">
                  <div className="flex items-center gap-1.5 rounded-md border border-[var(--vi-edge)] bg-black/40 px-2 py-2">
                    <span className="flex items-center gap-1.5 px-1">
                      {ITEM_COLOR_PRESETS.map((preset) => (
                        <ColorSwatch
                          key={preset}
                          color={preset}
                          selected={color === preset}
                          onPick={() => onUpdateCollectionColor(collection.id, preset)}
                        />
                      ))}
                    </span>
                    <span className="flex-1" />
                    {confirming ? (
                      <span className="flex shrink-0 items-center gap-1">
                        <Button
                          tone="danger"
                          size="sm"
                          className="h-6 px-2 text-[11px]"
                          onClick={() => onDeleteCollection(collection.id)}
                        >
                          Sure?
                        </Button>
                        <Button
                          tone="ghost"
                          size="icon"
                          className="size-6 [&_svg]:size-3"
                          aria-label="Cancel delete"
                          onClick={() => setConfirmDeleteId(null)}
                        >
                          <X />
                        </Button>
                      </span>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setRenamingId(collection.id);
                            setRenameDraft(collection.name);
                          }}
                          aria-label={`Rename ${collection.name}`}
                          className="grid size-8 place-items-center rounded-md text-zinc-500 outline-none transition-all hover:bg-white/[0.05] hover:text-zinc-100 motion-safe:active:scale-90 focus-visible:ring-2 focus-visible:ring-[var(--vi-focus)]"
                        >
                          <Pencil className="size-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(collection.id)}
                          aria-label={`Delete ${collection.name}`}
                          className="grid size-8 place-items-center rounded-md text-zinc-500 outline-none transition-all hover:bg-[color-mix(in_oklab,var(--accent-fill)_10%,transparent)] hover:text-accent-text motion-safe:active:scale-90 focus-visible:ring-2 focus-visible:ring-[var(--vi-focus)]"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      onClick={() => onOpenCollection(collection.id)}
                      className="shrink-0 rounded-md px-3.5 py-2 text-xs font-semibold outline-none transition-transform motion-safe:active:scale-95 focus-visible:ring-2 focus-visible:ring-white"
                      style={{ backgroundColor: color, color: onColorText(color) }}
                    >
                      Open
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })}

      {showComposer ? (
        <div className="mt-2 rounded-lg border border-dashed border-[var(--vi-edge-hi)] p-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-500">
            New collection
          </p>
          <div className="mt-2 flex items-center gap-3">
            <input
              autoFocus
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && newName.trim()) createCollection();
                if (event.key === "Escape") setShowComposer(false);
              }}
              placeholder="Collection name…"
              aria-label="New collection name"
              className="min-w-0 flex-1 rounded-md border border-[var(--vi-edge)] bg-[rgba(0,0,0,0.38)] px-2.5 py-1.5 text-[13px] font-semibold text-zinc-100 outline-none placeholder:font-normal placeholder:text-zinc-600 focus:border-[color-mix(in_oklab,var(--accent-fill)_60%,transparent)]"
            />
            <span className="flex shrink-0 items-center gap-1.5">
              {ITEM_COLOR_PRESETS.map((preset) => (
                <ColorSwatch
                  key={preset}
                  color={preset}
                  selected={newColor === preset}
                  onPick={() => setNewColor(preset)}
                />
              ))}
            </span>
          </div>
          <div className="mt-2.5 flex justify-end gap-2">
            <Button tone="ghost" size="sm" onClick={() => setShowComposer(false)}>
              Cancel
            </Button>
            <button
              type="button"
              disabled={!newName.trim()}
              onClick={createCollection}
              style={{ backgroundColor: newColor, color: onColorText(newColor) }}
              className="rounded-md px-3.5 py-1.5 text-xs font-semibold outline-none transition-[transform,opacity,filter] duration-150 hover:brightness-110 motion-safe:active:scale-95 focus-visible:ring-2 focus-visible:ring-white disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none"
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
          className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-[var(--vi-edge-hi)] py-3 text-xs font-semibold text-zinc-500 outline-none transition-colors hover:border-[color-mix(in_oklab,var(--accent-fill)_50%,transparent)] hover:text-accent-text motion-safe:active:scale-[0.99] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--vi-focus)]"
        >
          <Plus className="size-3.5" /> New collection
        </button>
      )}
    </div>
  );
}