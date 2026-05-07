"use client";

import {
  ChevronRight,
  Copy,
  ExternalLink,
  FolderOpen,
  GripVertical,
  Heart,
  MoreHorizontal,
  Pause,
  Play,
  Puzzle,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
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

import { highlightMatch } from "./highlight-match";
import type { FileTableFileRecord } from "./types";

export function FileTableFileRow({
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
  searchQuery,
  showDesktopActions,
  soundShelfEnabled,
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
  searchQuery: string;
  showDesktopActions: boolean;
  soundShelfEnabled: boolean;
  start: number;
  virtualIndex: number;
}) {
  const dispatchSoundShelfChanged = () => {
    window.dispatchEvent(new CustomEvent(SOUND_SHELF_CHANGED_EVENT));
  };

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
}
