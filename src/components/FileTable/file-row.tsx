"use client";

import { memo } from "react";
import {
  GripVertical,
  Heart,
  Pause,
  Play,
} from "lucide-react";

import {
  ContextMenu,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { formatDuration } from "@/lib/format";

import { FileRowMenu } from "./file-row-menu";
import { useShelfToggle } from "./use-shelf-toggle";
import type { V2ResolvedContribution } from "@yard-core";

import { highlightMatch } from "./highlight-match";
import { fileTableGridClass } from "./layout";
import { RowWaveform } from "./row-waveform";
import type { FileTableFileRecord, FileTableFileTag, SelectModifiers } from "./types";

export const FileTableFileRow = memo(function FileTableFileRow({
  desktop,
  file,
  handleCopyPath,
  handleDragEnd,
  handleNativeDragStart,
  isDragging,
  isSelected,
  isMultiSelected = false,
  isSelectedFilePlaying,
  onSelect,
  onToggleFavorite,
  onMakePackFile,
  resolveV2FileItems,
  onV2Command,
  searchQuery,
  showDesktopActions,
  makePackEnabled,
  soundShelfEnabled,
  inShelf,
  allTags,
  onToggleFileTag,
  onRemoveFile,
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
  isDragging: boolean;
  isSelected: boolean;
  isMultiSelected?: boolean;
  isSelectedFilePlaying: boolean;
  onSelect: (
    file: FileTableFileRecord,
    index: number,
    modifiers?: SelectModifiers,
  ) => void;
  onToggleFavorite: (id: string) => Promise<void>;
  onMakePackFile?: (file: FileTableFileRecord) => Promise<void>;
  resolveV2FileItems?: (fileId: string) => V2ResolvedContribution[];
  onV2Command?: (item: V2ResolvedContribution, file: FileTableFileRecord) => void;
  searchQuery: string;
  showDesktopActions: boolean;
  makePackEnabled: boolean;
  soundShelfEnabled: boolean;
  inShelf: boolean;
  allTags?: FileTableFileTag[];
  onToggleFileTag?: (fileId: string, tagId: string) => void;
  onRemoveFile?: (file: FileTableFileRecord) => Promise<void>;
  start: number;
  virtualIndex: number;
}) {
  const { toggleShelf } = useShelfToggle(file.id, inShelf);

  const meta = [file.format, ...file.tags.map((tag) => tag.name)]
    .filter((part): part is string => Boolean(part))
    .join(" · ");
  const extensionIndex = file.filename.lastIndexOf(".");
  const filenameWithoutExtension =
    extensionIndex > 0 && extensionIndex < file.filename.length - 1
      ? file.filename.slice(0, extensionIndex)
      : file.filename;
  const menuFilename = filenameWithoutExtension
    .replaceAll("_", " ")
    .replace(/\s+/g, " ")
    .trim();

  return (
    <ContextMenu>
      <ContextMenuTrigger>
        <div
          className={cn(
            "group absolute left-0 top-0 grid w-full cursor-pointer items-center gap-3 border-b border-white/5 px-3 outline-none transition-[background-color,color] last:border-0",
            fileTableGridClass(desktop),
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
          role="row"
          aria-selected={isSelected || isMultiSelected}
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
              sourceVersion={`${file.mtimeMs ?? "unknown"}:${file.fileSize ?? "unknown"}`}
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
              aria-pressed={file.isFavorite}
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
                        if (event.button === 0 && !isMultiSelected) {
                          onSelect(file, virtualIndex);
                        }
                      }}
                      onDragStart={(event) =>
                        handleNativeDragStart(event, file, virtualIndex)
                      }
                      onDragEnd={handleDragEnd}
                      aria-label={`Drag ${file.filename} into another app`}
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

      <FileRowMenu
        file={file}
        menuFilename={menuFilename}
        handleCopyPath={handleCopyPath}
        onToggleFavorite={onToggleFavorite}
        makePackEnabled={makePackEnabled}
        onMakePackFile={onMakePackFile}
        v2Items={resolveV2FileItems?.(file.id) ?? []}
        onV2Command={onV2Command ? (item) => onV2Command(item, file) : undefined}
        soundShelfEnabled={soundShelfEnabled}
        inShelf={inShelf}
        onToggleShelf={() => void toggleShelf()}
        allTags={allTags}
        onToggleFileTag={onToggleFileTag}
        onRemoveFile={onRemoveFile}
      />
    </ContextMenu>
  );
});
