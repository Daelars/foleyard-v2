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

export interface BulkBarTag {
  id: string;
  name: string;
}

export function SelectionBulkBar({
  count,
  tags,
  soundShelfEnabled,
  onSaveAll,
  onAddToQueue,
  onAddToShelf,
  onTag,
  onRemoveFromLibrary,
  onDeleteFromDisk,
  onClear,
}: {
  count: number;
  tags: BulkBarTag[];
  soundShelfEnabled: boolean;
  onSaveAll: () => void;
  onAddToQueue: () => void;
  onAddToShelf: () => void;
  onTag: (tagId: string) => void;
  onRemoveFromLibrary: () => void;
  onDeleteFromDisk: () => void;
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
      <Button
        type="button"
        variant="outline"
        size="xs"
        className="gap-1.5 hover:border-destructive/40 hover:text-destructive"
        onClick={onRemoveFromLibrary}
      >
        <Trash2 className="size-3.5" />
        Remove from library
      </Button>
      <Button
        type="button"
        variant="outline"
        size="xs"
        className="gap-1.5 hover:border-destructive/40 hover:text-destructive"
        onClick={onDeleteFromDisk}
      >
        <Trash2 className="size-3.5" />
        Delete from disk
      </Button>
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
