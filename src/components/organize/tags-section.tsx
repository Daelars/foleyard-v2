"use client";

import { useState } from "react";
import { Plus, Trash2, X } from "lucide-react";

import { ITEM_COLOR_PRESETS } from "@/lib/item-colors";

import { NameColorComposer, isComposerNameValid } from "./name-color-composer";
import { Swatches } from "./swatches";
import {
  isTagDeleteArmed,
  resolveTagEscape,
  switchEditingTag,
} from "./tag-confirm";
import type { TagsSectionProps } from "./types";

export function TagsSection({
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
    <>
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
                className="field-rise w-full max-w-md rounded-2xl border border-accent-fill/50 bg-accent-fill/[0.07] p-2"
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
                        const next = resolveTagEscape(
                          confirmTagDeleteId,
                          editingTag,
                          tag.id,
                        );
                        setConfirmTagDeleteId(next.confirmTagDeleteId);
                        setEditingTag(next.editingTagId);
                      }
                    }}
                    aria-label="Rename tag"
                    className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/30 px-2 py-1 text-xs font-semibold text-zinc-100 focus:border-accent-fill/60 focus:outline-none"
                  />
                  {isTagDeleteArmed(confirmTagDeleteId, tag.id) ? (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          onDeleteTag(tag.id);
                          setEditingTag(null);
                          setConfirmTagDeleteId(null);
                        }}
                        className="shrink-0 rounded-lg bg-destructive/15 px-2.5 py-1 text-xs font-semibold text-destructive transition-all hover:bg-destructive/25 active:scale-95"
                      >
                        Sure?
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmTagDeleteId(null)}
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
                        onClick={() => setConfirmTagDeleteId(tag.id)}
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
                setConfirmTagDeleteId(switchEditingTag());
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
        <div className="field-rise mt-2 max-w-md rounded-2xl border border-dashed border-white/20 p-3">
          <NameColorComposer
            name={tagName}
            color={tagColor}
            onNameChange={setTagName}
            onColorChange={setTagColor}
            onSubmit={createTag}
            onCancel={() => setShowTagComposer(false)}
            submitLabel="Add tag"
            namePlaceholder="Tag name…"
            nameAriaLabel="New tag name"
          />
        </div>
      ) : null}
    </>
  );
}
