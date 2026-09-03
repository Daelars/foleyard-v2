"use client";

import { memo, useMemo } from "react";
import {
  ChevronRight,
  Copy,
  ExternalLink,
  FolderOpen,
  GripVertical,
  Heart,
  MoreHorizontal,
  PackagePlus,
  Pause,
  Play,
  Puzzle,
  Tags,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { SOUND_SHELF_CHANGED_EVENT } from "@/lib/extensions/sound-shelf-events";
import { cn, formatDuration } from "@/lib/utils";

import { TagPicker, type TagItem } from "@/components/TagPicker";

import { highlightMatch } from "./highlight-match";
import type { FileTableFileRecord } from "./types";

function fileTagIdsMemo(file: FileTableFileRecord): Set<string> {
  return new Set(file.tags.map((t) => t.id));
}

export const FileTableFileRow = memo(function FileTableFileRow({
  desktop,
  file,
  handleCopyPath,
  handleDragEnd,
  handleNativeDragStart,
  handleOpenFile,
  handleRevealInExplorer,
  isDragging,
  isSelected,
  isSelectedFilePlaying,
  onSelect,
  onToggleFavorite,
  onMakePackFile,
  searchQuery,
  showDesktopActions,
  makePackEnabled,
  soundShelfEnabled,
  allTags,
  onToggleFileTag,
  start,
  virtualIndex,
}: {
  desktop: boolean;
  file: FileTableFileRecord;
  handleCopyPath: (file: FileTableFileRecord) => Promise<void>;
  handleDragEnd: () => void;
  handleNativeDragStart: (
    event: React.DragEvent<HTMLElement>,
    file: FileTableFileRecord,
    index: number,
  ) => void;
  handleOpenFile: (file: FileTableFileRecord) => Promise<void>;
  handleRevealInExplorer: (file: FileTableFileRecord) => Promise<void>;
  isDragging: boolean;
  isSelected: boolean;
  isSelectedFilePlaying: boolean;
  onSelect: (file: FileTableFileRecord, index: number) => void;
  onToggleFavorite: (id: string) => Promise<void>;
  onMakePackFile?: (file: FileTableFileRecord) => Promise<void>;
  searchQuery: string;
  showDesktopActions: boolean;
  makePackEnabled: boolean;
  soundShelfEnabled: boolean;
  allTags?: TagItem[];
  onToggleFileTag?: (fileId: string, tagId: string) => void;
  start: number;
  virtualIndex: number;
}) {
  const dispatchSoundShelfChanged = () => {
    window.dispatchEvent(new CustomEvent(SOUND_SHELF_CHANGED_EVENT));
  };

  const fileTagIds = useMemo(() => fileTagIdsMemo(file), [file]);

  return (
    <ContextMenu>
      <ContextMenuTrigger>
        <div
          className={cn(
            "group absolute left-0 top-0 flex w-full cursor-pointer items-center gap-4 border-b border-border/35 px-4 py-2 transition-[background-color,color,box-shadow] focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            isSelected
              ? "bg-primary/10 text-primary shadow-[inset_3px_0_0_var(--primary)] backdrop-blur"
              : "hover:bg-accent/50 hover:text-accent-foreground hover:backdrop-blur",
            isDragging && "opacity-60",
          )}
          style={{
            height: "64px",
            transform: `translateY(${start}px)`,
          }}
          onClick={() => onSelect(file, virtualIndex)}
        >
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted/45 ring-1 ring-border/50">
            {isSelected && isSelectedFilePlaying ? (
              <Pause className="size-4 fill-current text-primary transition-all" />
            ) : (
              <Play
                className={cn(
                  "size-4 transition-all",
                  isSelected
                    ? "fill-current text-primary"
                    : "text-muted-foreground/60 group-hover:text-muted-foreground",
                )}
              />
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-foreground transition-colors group-hover:text-primary">
              {highlightMatch(file.filename, searchQuery)}
            </div>
            <div className="mt-1 flex items-center gap-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              <span className="rounded bg-muted/50 px-1.5 py-0.5 text-[9px] ring-1 ring-border/50">
                {file.format ?? "???"}
              </span>
              <span>{formatDuration(file.duration)}</span>
              {file.tags.length > 0 ? (
                <div className="flex items-center gap-1">
                  {file.tags.slice(0, 3).map((tag) => (
                    <span
                      key={tag.id}
                      className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] font-normal text-primary ring-1 ring-primary/20"
                    >
                      {tag.name}
                      <button
                        type="button"
                        className="hover:text-destructive"
                        onClick={(event) => {
                          event.stopPropagation();
                          onToggleFileTag?.(file.id, tag.id);
                        }}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                  {file.tags.length > 3 ? (
                    <span className="text-[9px] text-muted-foreground">
                      +{file.tags.length - 3}
                    </span>
                  ) : null}
                </div>
              ) : null}
              <TagPicker
                allTags={allTags ?? []}
                fileTagIds={fileTagIds}
                onToggleTag={(tagId) => onToggleFileTag?.(file.id, tagId)}
                label="Tags"
                align="start"
              />
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            {desktop ? (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <div
                      role="button"
                      tabIndex={0}
                      draggable
                      className={cn(
                        "flex size-8 items-center justify-center rounded-full text-muted-foreground/65 opacity-0 transition-all group-hover:opacity-100",
                        showDesktopActions && "opacity-100",
                        isDragging && "cursor-grabbing",
                        !isDragging &&
                          "cursor-grab hover:bg-accent/50 hover:text-accent-foreground",
                      )}
                      onClick={(event) => event.stopPropagation()}
                      onMouseDown={(event) => {
                        event.stopPropagation();
                        if (event.button === 0) {
                          onSelect(file, virtualIndex);
                        }
                      }}
                      onDragStart={(event) =>
                        handleNativeDragStart(event, file, virtualIndex)
                      }
                      onDragEnd={handleDragEnd}
                      aria-label="Drag file into another app"
                    >
                      <GripVertical className="size-4" />
                    </div>
                  }
                />
                <TooltipContent>Drag into another app</TooltipContent>
              </Tooltip>
            ) : null}

            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon"
                    className={cn(
                      "size-8 rounded-full transition-all",
                      file.isFavorite
                        ? "bg-primary/10 text-primary hover:bg-primary/10 hover:text-primary"
                        : "text-muted-foreground/60 hover:bg-accent/50 hover:text-accent-foreground",
                    )}
                    onClick={(event) => {
                      event.stopPropagation();
                      void onToggleFavorite(file.id);
                    }}
                  >
                    <Heart className={cn("size-4", file.isFavorite && "fill-current")} />
                  </Button>
                }
              />
              <TooltipContent>
                {file.isFavorite ? "Remove from favorites" : "Add to favorites"}
              </TooltipContent>
            </Tooltip>

            {desktop ? (
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="icon"
                      className={cn(
                        "size-8 rounded-full text-muted-foreground/60 opacity-0 transition-all hover:bg-accent/50 hover:text-accent-foreground group-hover:opacity-100",
                        isSelected && "opacity-100",
                      )}
                      onClick={(event) => event.stopPropagation()}
                      aria-label="More file actions"
                    >
                      <MoreHorizontal className="size-4" />
                    </Button>
                  }
                />
                <DropdownMenuContent
                  align="end"
                  className="w-44"
                >
                  <DropdownMenuItem onClick={() => void handleRevealInExplorer(file)}>
                    <FolderOpen className="size-4" />
                    Reveal in Explorer
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => void handleOpenFile(file)}>
                    <ExternalLink className="size-4" />
                    Open file
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => void handleCopyPath(file)}>
                    <Copy className="size-4" />
                    Copy path
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}

            <ChevronRight
              className={cn(
                "size-4 text-muted-foreground transition-transform",
                isSelected
                  ? "translate-x-1 text-primary"
                  : "group-hover:translate-x-0.5",
              )}
            />
          </div>
        </div>
      </ContextMenuTrigger>

      <ContextMenuContent className="w-44">
        <ContextMenuLabel>{file.filename}</ContextMenuLabel>
        <ContextMenuSeparator />
        {desktop ? (
          <>
            <ContextMenuItem onClick={() => void handleRevealInExplorer(file)}>
              <FolderOpen />
              Reveal in Explorer
            </ContextMenuItem>
            <ContextMenuItem onClick={() => void handleOpenFile(file)}>
              <ExternalLink />
              Open file
            </ContextMenuItem>
            <ContextMenuSeparator />
          </>
        ) : null}
        <ContextMenuItem onClick={() => void handleCopyPath(file)}>
          <Copy />
          Copy path
        </ContextMenuItem>
        <>
          <ContextMenuSeparator />
          <ContextMenuSub>
            <ContextMenuSubTrigger>
              <Tags className="size-4" />
              Tags
            </ContextMenuSubTrigger>
            <ContextMenuSubContent className="w-48 max-h-64 overflow-y-auto">
              {allTags && allTags.length > 0 ? (
                allTags.map((tag) => (
                  <ContextMenuCheckboxItem
                    key={tag.id}
                    checked={file.tags.some((t) => t.id === tag.id)}
                    onCheckedChange={() => onToggleFileTag?.(file.id, tag.id)}
                    className="text-popover-foreground"
                  >
                    {tag.name}
                  </ContextMenuCheckboxItem>
                ))
              ) : (
                <ContextMenuItem disabled className="text-muted-foreground">
                  No tags yet
                </ContextMenuItem>
              )}
            </ContextMenuSubContent>
          </ContextMenuSub>
        </>
        {makePackEnabled ? (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem onClick={() => void onMakePackFile?.(file)}>
              <PackagePlus />
              Make Pack
            </ContextMenuItem>
          </>
        ) : null}
        {soundShelfEnabled ? (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem
              onClick={() => {
                void fetch("/api/extensions/sound-shelf/add", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ fileIds: [file.id] }),
                }).then((response) => {
                  if (response.ok) {
                    dispatchSoundShelfChanged();
                  }
                });
              }}
            >
              <Puzzle className="size-4" />
              Add to Shelf
            </ContextMenuItem>
            <ContextMenuItem
              onClick={() => {
                void fetch("/api/extensions/sound-shelf/remove", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ fileIds: [file.id] }),
                }).then((response) => {
                  if (response.ok) {
                    dispatchSoundShelfChanged();
                  }
                });
              }}
            >
              <X className="size-4" />
              Remove from Shelf
            </ContextMenuItem>
          </>
        ) : null}
      </ContextMenuContent>
    </ContextMenu>
  );
});
