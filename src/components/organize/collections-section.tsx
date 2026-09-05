"use client";

import { useState } from "react";
import { ChevronDown, Pencil, Plus, Trash2, X } from "lucide-react";

import { ITEM_COLOR_PRESETS, onColorText } from "@/lib/item-colors";

import { NameColorComposer, isComposerNameValid } from "./name-color-composer";
import { Swatches } from "./swatches";
import type {
  CollectionsSectionProps,
  OrganizeCollection,
} from "./types";

const FEATHER_MASK = {
  WebkitMaskImage:
    "radial-gradient(100% 100% at 50% 50%, black 38%, transparent 98%)",
  maskImage:
    "radial-gradient(100% 100% at 50% 50%, black 38%, transparent 98%)",
} as const;

/**
 * Displayed sound count for one Collection row. Smart Collections prefer the
 * lazily resolved count requested on expand and fall back to the stored file
 * count until it arrives; plain Collections always read the stored count.
 */
export function resolveCollectionCount(
  collection: Pick<OrganizeCollection, "isSmart" | "fileCount">,
  smartCounts: Record<string, number> | undefined,
  collectionId: string,
): number {
  if (collection.isSmart) {
    return smartCounts?.[collectionId] ?? collection.fileCount ?? 0;
  }
  return collection.fileCount ?? 0;
}

export function CollectionsSection({
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
    <>
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
              className="field-rise relative overflow-hidden rounded-2xl border border-white/10 transition-all duration-300"
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
                        {confirming ? (
                          <span className="field-rise flex shrink-0 items-center gap-1">
                            <button
                              type="button"
                              onClick={() => onDeleteCollection(collection.id)}
                              className="shrink-0 rounded-lg bg-destructive/15 px-2.5 py-1 text-xs font-semibold text-destructive transition-all hover:bg-destructive/25 active:scale-95"
                            >
                              Sure?
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(null)}
                              aria-label="Cancel delete"
                              className="flex size-6 shrink-0 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-white/5 hover:text-zinc-100"
                            >
                              <X className="size-3" />
                            </button>
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
                          </>
                        )}
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
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {showComposer ? (
        <div className="field-rise mt-2 rounded-2xl border border-dashed border-white/20 p-4">
          <NameColorComposer
            name={newName}
            color={newColor}
            onNameChange={setNewName}
            onColorChange={setNewColor}
            onSubmit={createCollection}
            onCancel={() => setShowComposer(false)}
            submitLabel="Create collection"
            namePlaceholder="Collection name…"
            nameAriaLabel="New collection name"
          />
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
    </>
  );
}
