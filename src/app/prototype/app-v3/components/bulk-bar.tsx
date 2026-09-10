"use client";

// app-v3 adapter for SelectionBulkBar: same bulk-action contract
// (save all / queue / shelf / tag / staged library|disk removal / clear,
// plus the v2 selection-actions slot), I bulk-bar treatment.
import { useCallback, useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";

import { BulkBar, Menu, MenuItem, type RemoveStage } from "@/components/variant-i";
import type { FileTableFileTag } from "@/components/FileTable/types";

export type BulkRemoveStage =
  | { stage: "choose" }
  | { stage: "confirm"; choice: "library" | "disk" };

function toRemoveStage(stage: BulkRemoveStage | null): RemoveStage {
  if (!stage) return null;
  if (stage.stage === "choose") return "choose";
  return { confirm: stage.choice };
}

export function V3SelectionBulkBar({
  count,
  tags,
  soundShelfEnabled,
  onSaveAll,
  onAddToQueue,
  onAddToShelf,
  onTag,
  onRemove,
  bulkRemove,
  removeDefault,
  onChooseRemove,
  onConfirmRemove,
  onCancelRemove,
  onClear,
  v2Actions,
}: {
  count: number;
  tags: FileTableFileTag[];
  soundShelfEnabled: boolean;
  onSaveAll: () => void;
  onAddToQueue: () => void;
  onAddToShelf: () => void;
  onTag: (tagId: string) => void;
  onRemove: () => void;
  bulkRemove: BulkRemoveStage | null;
  removeDefault: "library" | "disk";
  onChooseRemove: (choice: "library" | "disk") => void;
  onConfirmRemove: () => void;
  onCancelRemove: () => void;
  onClear: () => void;
  v2Actions?: React.ReactNode;
}) {
  const [tagOpen, setTagOpen] = useState(false);
  const [tagPos, setTagPos] = useState<{ top: number; left: number } | null>(null);
  const tagTriggerRef = useRef<HTMLButtonElement>(null);
  const tagMenuRef = useRef<HTMLDivElement>(null);

  const measure = useCallback(() => {
    const trigger = tagTriggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    setTagPos({ top: rect.bottom + 6, left: Math.max(8, rect.right - 192) });
  }, []);

  useEffect(() => {
    if (!tagOpen) return;
    measure();
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!tagTriggerRef.current?.contains(target) && !tagMenuRef.current?.contains(target)) {
        setTagOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setTagOpen(false);
        tagTriggerRef.current?.focus();
      }
    };
    const onReposition = () => measure();
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", onReposition, true);
    window.addEventListener("resize", onReposition);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", onReposition, true);
      window.removeEventListener("resize", onReposition);
    };
  }, [tagOpen, measure]);

  const tagMenu = (
    <>
      <button
        ref={tagTriggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={tagOpen}
        onClick={() => (tagOpen ? setTagOpen(false) : (measure(), setTagOpen(true)))}
        className="inline-flex shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-[var(--vi-edge)] bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.018))] px-3 text-xs font-medium text-zinc-200 shadow-[var(--vi-lift)] outline-none transition-[background-color,border-color,box-shadow,color,transform] duration-150 motion-reduce:transition-none motion-safe:hover:-translate-y-px motion-safe:active:translate-y-px motion-safe:active:scale-[0.97] hover:border-[var(--vi-edge-hi)] hover:text-zinc-50 hover:bg-[linear-gradient(180deg,rgba(255,255,255,0.075),rgba(255,255,255,0.03))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vi-focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0a0e] [&_svg]:size-3.5 [&_svg]:text-zinc-400"
      >
        <TagsGlyph />
        Tag
      </button>
      {tagOpen && tagPos ? (
        <div
          ref={tagMenuRef}
          role="menu"
          aria-label="Tag selected sounds"
          style={{ top: tagPos.top, left: tagPos.left }}
          className="fixed z-[70] w-48 [animation:vi-menu-in_0.14s_ease-out] motion-reduce:[animation:none]"
        >
          <Menu label={`Tag ${count} sounds`}>
            {tags.length === 0 ? (
              <MenuItem disabled>No tags yet</MenuItem>
            ) : (
              tags.map((tag) => (
                <MenuItem
                  key={tag.id}
                  onClick={() => {
                    setTagOpen(false);
                    onTag(tag.id);
                  }}
                >
                  <span
                    aria-hidden
                    className="size-2 shrink-0 rounded-full"
                    style={{ backgroundColor: tag.color ?? "var(--accent-fill)" }}
                  />
                  <span className="min-w-0 flex-1 truncate">{tag.name}</span>
                  <Check aria-hidden className="size-3.5 shrink-0 text-transparent" />
                </MenuItem>
              ))
            )}
          </Menu>
        </div>
      ) : null}
    </>
  );

  return (
    <BulkBar
      count={count}
      removeDefault={removeDefault}
      stage={toRemoveStage(bulkRemove)}
      onStageChange={(stage) => {
        if (stage === null) {
          onCancelRemove();
          return;
        }
        if (stage === "choose") {
          onRemove();
          return;
        }
        onChooseRemove(stage.confirm);
      }}
      onConfirm={onConfirmRemove}
      onSaveAll={onSaveAll}
      onAddToQueue={onAddToQueue}
      onAddToShelf={soundShelfEnabled ? onAddToShelf : undefined}
      onTag={undefined}
      onClear={onClear}
    >
      {v2Actions}
      {tagMenu}
    </BulkBar>
  );
}

function TagsGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z" />
      <circle cx="7.5" cy="7.5" r=".5" fill="currentColor" />
    </svg>
  );
}