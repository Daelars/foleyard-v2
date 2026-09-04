"use client";

import { memo } from "react";
import {
  Copy,
  ExternalLink,
  FolderOpen,
  GripVertical,
  Heart,
  PackagePlus,
  Pause,
  Play,
  Puzzle,
  Tags,
  X,
} from "lucide-react";

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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { SOUND_SHELF_CHANGED_EVENT } from "@/lib/extensions/sound-shelf-events";
import { cn, formatDuration } from "@/lib/utils";

import { highlightMatch } from "./highlight-match";
import { RowWaveform } from "./row-waveform";
import type { FileTableFileRecord } from "./types";

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
  isMultiSelected = false,
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
  isMultiSelected?: boolean;
  isSelectedFilePlaying: boolean;
  onSelect: (
    file: FileTableFileRecord,
    index: number,
    modifiers?: { shiftKey?: boolean; ctrlKey?: boolean; metaKey?: boolean },
  ) => void;
  onToggleFavorite: (id: string) => Promise<void>;
  onMakePackFile?: (file: FileTableFileRecord) => Promise<void>;
  searchQuery: string;
  showDesktopActions: boolean;
  makePackEnabled: boolean;
  soundShelfEnabled: boolean;
  allTags?: { id: string; name: string }[];
  onToggleFileTag?: (fileId: string, tagId: string) => void;
  start: number;
  virtualIndex: number;
}) {
  const dispatchSoundShelfChanged = () => {
    window.dispatchEvent(new CustomEvent(SOUND_SHELF_CHANGED_EVENT));
  };

  const meta = [file.format, ...file.tags.map((tag) => tag.name)]
    .filter((part): part is string => Boolean(part))
    .join(" · ");

  return (
    <ContextMenu>
      <ContextMenuTrigger>
        <div
          className={cn(
            "group absolute left-0 top-0 grid w-full cursor-pointer items-center gap-3 border-b border-white/5 px-3 outline-none transition-[background-color,color] last:border-0",
            desktop
              ? "grid-cols-[32px_minmax(0,1fr)_140px_64px_28px_28px]"
              : "grid-cols-[32px_minmax(0,1fr)_140px_64px_28px]",
            isSelected
              ? "bg-accent-fill/10"
              : isMultiSelected
                ? "bg-accent-fill/5"
                : "hover:bg-white/[0.04]",
            isDragging && "opacity-60",
          )}
          style={{
            height: "64px",
            transform: `translateY(${start}px)`,
          }}
          tabIndex={0}
          data-file-id={file.id}
          onClick={(event) =>
            onSelect(file, virtualIndex, {
              shiftKey: event.shiftKey,
              ctrlKey: event.ctrlKey,
              metaKey: event.metaKey,
            })
          }
        >
          {isSelected && (
            <span className="pointer-events-none absolute inset-y-2 left-0 w-[3px] rounded-full bg-accent-fill shadow-glow-accent" />
          )}
          <span
            className={cn(
              "flex justify-center",
              isSelected && isSelectedFilePlaying
                ? "text-accent-text"
                : "text-zinc-500",
            )}
          >
            {isSelected && isSelectedFilePlaying ? (
              <Pause className="size-4" />
            ) : (
              <Play className="size-4" />
            )}
          </span>
          <span className="min-w-0">
            <span
              className={cn(
                "block truncate text-[15px] font-medium",
                isSelected ? "font-semibold text-zinc-50" : "text-zinc-100",
              )}
            >
              {highlightMatch(file.filename, searchQuery)}
            </span>
            {meta ? (
              <span className="mt-0.5 block truncate font-mono text-[11px] text-zinc-400">
                {meta}
              </span>
            ) : null}
          </span>
          <span className="hidden min-w-0 sm:block">
            <RowWaveform
              fileId={file.id}
              filePath={file.path}
              active={isSelected}
            />
          </span>
          <span className="text-right font-mono text-xs font-medium tabular-nums text-zinc-300">
            {formatDuration(file.duration)}
          </span>
          <span className="flex justify-center">
            <button
              type="button"
              aria-label={
                file.isFavorite
                  ? `Unsave ${file.filename}`
                  : `Save ${file.filename}`
              }
              onClick={(event) => {
                event.stopPropagation();
                void onToggleFavorite(file.id);
              }}
              className="flex justify-center outline-none"
            >
              <Heart
                className={cn(
                  "size-4 transition-colors",
                  file.isFavorite
                    ? "fill-accent-fill text-accent-fill"
                    : isMultiSelected
                      ? "text-accent-text/70"
                      : "text-zinc-600 hover:text-accent-text",
                )}
              />
            </button>
          </span>
          {desktop ? (
            <span className="flex justify-center">
              <Tooltip>
                <TooltipTrigger
                  render={
                    <div
                      role="button"
                      tabIndex={0}
                      draggable
                      className={cn(
                        "flex size-8 items-center justify-center rounded-full text-zinc-500 opacity-0 transition-all group-hover:opacity-100",
                        showDesktopActions && "opacity-100",
                        isDragging && "cursor-grabbing",
                        !isDragging &&
                          "cursor-grab hover:bg-white/5 hover:text-zinc-200",
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
            </span>
          ) : null}
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
                <ContextMenuItem disabled className="text-zinc-500">
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
