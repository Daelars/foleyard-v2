"use client";

// app-v3 adapter for FileTableFileRow: same selection/drag/toggle contract,
// I row treatment (hairline border, dark well, red play glyph, heart,
// waveform column, drag handle).
import { memo } from "react";
import { GripVertical, Heart, Pause, Play } from "lucide-react";

import { TagOriginMark } from "@/components/FileTable/tag-origin-mark";
import { cn } from "@/lib/utils";
import { formatDuration } from "@/lib/format";

import { highlightMatch } from "@/components/FileTable/highlight-match";
import { fileTableGridClass } from "@/components/FileTable/layout";
import { RowWaveform } from "@/components/FileTable/row-waveform";
import type { FileTableFileRecord, SelectModifiers } from "@/components/FileTable/types";

export const V3FileRow = memo(function V3FileRow({
  desktop,
  file,
  isDragging,
  isSelected,
  isMultiSelected = false,
  isSelectedFilePlaying,
  onSelect,
  onToggleFavorite,
  searchQuery,
  showDesktopActions,
  handleDragEnd,
  handleNativeDragStart,
  onContextMenu,
  virtualIndex,
  start,
}: {
  desktop: boolean;
  file: FileTableFileRecord;
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
  searchQuery: string;
  showDesktopActions: boolean;
  handleDragEnd: () => void;
  handleNativeDragStart: (
    event: React.DragEvent<HTMLElement>,
    file: FileTableFileRecord,
    index: number,
  ) => void;
  onContextMenu: (event: React.MouseEvent, file: FileTableFileRecord) => void;
  virtualIndex: number;
  start: number;
}) {
  const metaParts: React.ReactNode[] = [];
  if (file.format) {
    metaParts.push(<span key="format">{file.format}</span>);
  }
  for (const tag of file.tags) {
    metaParts.push(
      <span key={tag.id}>
        {tag.name} <TagOriginMark origin={tag.origin} confidence={tag.confidence} />
      </span>,
    );
  }

  return (
    <div
      className={cn(
        "group absolute left-0 top-0 grid w-full cursor-pointer items-center gap-3 border-b border-[var(--vi-edge)] px-3 outline-none transition-[background-color,color] last:border-0",
        fileTableGridClass(desktop),
        isSelected
          ? "bg-[color-mix(in_oklab,var(--accent-fill)_10%,transparent)]"
          : isMultiSelected
            ? "bg-[color-mix(in_oklab,var(--accent-fill)_5%,transparent)]"
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
      onContextMenu={(event) => onContextMenu(event, file)}
    >
      {isSelected && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-2 left-0 w-[3px] rounded-full bg-accent-fill shadow-[0_0_12px_color-mix(in_oklab,var(--accent-fill)_40%,transparent)]"
        />
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
        {metaParts.length > 0 ? (
          <span className="mt-0.5 block truncate font-mono text-[11px] text-zinc-400">
            {metaParts.map((part, index) => (
              <span key={index === 0 ? "first" : `sep-${index}`}>
                {index > 0 ? <span className="text-zinc-600"> · </span> : null}
                {part}
              </span>
            ))}
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
          <div
            role="button"
            tabIndex={0}
            draggable
            className={cn(
              "flex size-8 items-center justify-center rounded-full text-zinc-500 opacity-0 transition-all group-hover:opacity-100",
              showDesktopActions && "opacity-100",
              isDragging && "cursor-grabbing",
              !isDragging &&
                "cursor-grab hover:bg-white/[0.05] hover:text-zinc-200",
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
            title="Drag into another app"
          >
            <GripVertical className="size-4" />
          </div>
        </span>
      ) : null}
    </div>
  );
});

export type { FileTableFileRecord, FileTableFileTag } from "@/components/FileTable/types";