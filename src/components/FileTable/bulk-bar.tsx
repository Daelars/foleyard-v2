"use client";

import { Heart, ListPlus, Puzzle, Tags, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { FileTableFileTag } from "./types";

export type BulkRemoveStage =
  | { stage: "choose" }
  | { stage: "confirm"; choice: "library" | "disk" };

export function SelectionBulkBar({
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
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-accent-fill/40 bg-accent-fill/10 px-3 py-2 text-xs shadow-glow-accent">
      <span className="font-mono font-semibold tabular-nums text-accent-text">
        {count} selected
      </span>
      <span className="flex-1" />
      <Button
        type="button"
        variant="outline"
        size="xs"
        className="gap-1.5"
        onClick={onSaveAll}
      >
        <Heart className="size-3.5" />
        Save all
      </Button>
      <Button
        type="button"
        variant="outline"
        size="xs"
        className="gap-1.5"
        onClick={onAddToQueue}
      >
        <ListPlus className="size-3.5" />
        Add to queue
      </Button>
      {soundShelfEnabled ? (
        <Button
          type="button"
          variant="outline"
          size="xs"
          className="gap-1.5"
          onClick={onAddToShelf}
        >
          <Puzzle className="size-3.5" />
          Add to Shelf
        </Button>
      ) : null}
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button type="button" variant="outline" size="xs" className="gap-1.5">
              <Tags className="size-3.5" />
              Tag
            </Button>
          }
        />
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuLabel className="text-zinc-500">
            Tag {count} sounds
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {tags.length === 0 ? (
            <DropdownMenuItem disabled className="text-zinc-500">
              No tags yet
            </DropdownMenuItem>
          ) : (
            tags.map((tag) => (
              <DropdownMenuItem
                key={tag.id}
                onClick={() => onTag(tag.id)}
                className="text-popover-foreground"
              >
                {tag.name}
              </DropdownMenuItem>
            ))
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {!bulkRemove ? (
        <Button
          type="button"
          variant="outline"
          size="xs"
          className="gap-1.5 hover:border-destructive/40 hover:text-destructive"
          onClick={onRemove}
        >
          <Trash2 className="size-3.5" />
          Remove
        </Button>
      ) : bulkRemove.stage === "choose" ? (
        <>
          <Button
            type="button"
            variant="outline"
            size="xs"
            className="gap-1.5 hover:border-destructive/40 hover:text-destructive"
            onClick={() => onChooseRemove("library")}
          >
            <Trash2 className="size-3.5" />
            From library
            {removeDefault === "library" ? (
              <span className="rounded-full bg-white/10 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-widest text-zinc-400">
                Default
              </span>
            ) : null}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="xs"
            className="gap-1.5 hover:border-destructive/40 hover:text-destructive"
            onClick={() => onChooseRemove("disk")}
          >
            <Trash2 className="size-3.5" />
            From disk
            {removeDefault === "disk" ? (
              <span className="rounded-full bg-white/10 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-widest text-zinc-400">
                Default
              </span>
            ) : null}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            className="gap-1.5 text-zinc-400"
            onClick={onCancelRemove}
            aria-label="Cancel remove"
          >
            <X className="size-3.5" />
          </Button>
        </>
      ) : (
        <>
          <Button
            type="button"
            variant="outline"
            size="xs"
            className={`gap-1.5 transition-all active:scale-95 ${
              bulkRemove.choice === "disk"
                ? "border-destructive/60 bg-destructive/15 text-destructive hover:bg-destructive/25 hover:text-destructive"
                : "border-accent-fill/60 bg-accent-fill/10 text-accent-text hover:bg-accent-fill/15 hover:text-accent-text"
            }`}
            onClick={onConfirmRemove}
          >
            Sure?
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            className="gap-1.5 text-zinc-400"
            onClick={onCancelRemove}
            aria-label="Cancel remove"
          >
            <X className="size-3.5" />
          </Button>
        </>
      )}
      <Button
        type="button"
        variant="ghost"
        size="xs"
        className="gap-1.5 text-zinc-400"
        onClick={onClear}
      >
        <X className="size-3.5" />
        Clear
      </Button>
    </div>
  );
}
