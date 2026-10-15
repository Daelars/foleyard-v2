"use client";

// app-v3 adapter for FileTableDirectoryRow: I directory row treatment
// (folder tile, label/subtitle, chevron) with the folder-janitor scan
// context action.
import { memo } from "react";
import { ChevronRight, Folder, Scan } from "lucide-react";

import { MenuItem } from "@/components/variant-i";
import { cn } from "@/lib/utils";
import { getDirectorySubtitle } from "@/lib/directory-navigation";
import { fileTableGridClass } from "@/components/FileTable/layout";
import type { FileTableDirectory } from "@/components/FileTable/types";

import { isContextMenuKey, rowMenuTargetFromEvent, type RowMenuTarget } from "../context-menu";

export const V3DirectoryRow = memo(function V3DirectoryRow({
  dir,
  start,
  virtualIndex,
  onNavigate,
  folderJanitorEnabled,
  onScanFolder,
  desktop = false,
  onContextMenu,
}: {
  dir: FileTableDirectory;
  start: number;
  virtualIndex: number;
  onNavigate: (dir: FileTableDirectory) => void;
  folderJanitorEnabled?: boolean;
  onScanFolder?: (folderPath: string) => void;
  desktop?: boolean;
  onContextMenu: (target: RowMenuTarget, dir: FileTableDirectory) => void;
}) {
  return (
    <div
      className={cn(
        "group absolute left-0 top-0 grid w-full cursor-pointer items-center gap-3 border-b border-[var(--vi-edge)] px-3 outline-none transition-[background-color,color] last:border-0 hover:bg-white/[0.04]",
        fileTableGridClass(desktop),
      )}
      style={{
        height: "64px",
        transform: `translateY(${start}px)`,
      }}
      onClick={() => onNavigate(dir)}
      onContextMenu={(event) => onContextMenu(rowMenuTargetFromEvent(event), dir)}
      role="row"
      // The table's header row is row 1, so the first virtual item is row 2.
      aria-rowindex={virtualIndex + 2}
    >
      <span
        role="gridcell"
        aria-colindex={1}
        className="flex justify-center text-zinc-500"
      >
        <Folder className="size-4" />
      </span>
      <span role="gridcell" aria-colindex={2} className="min-w-0">
        {/* Folders are still opened with a button, just inside the grid rather
            than as a row that claims a role a grid row cannot have. */}
        <button
          type="button"
          aria-label={`Open folder ${dir.label}`}
          className="block w-full cursor-pointer text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--vi-focus)]"
          onClick={(event) => {
            event.stopPropagation();
            onNavigate(dir);
          }}
          onKeyDown={(event) => {
            if (!isContextMenuKey(event)) return;
            event.preventDefault();
            event.stopPropagation();
            onContextMenu(
              { x: 0, y: 0, anchor: event.currentTarget, keyboard: true },
              dir,
            );
          }}
        >
          <span className="block truncate text-[15px] font-medium text-zinc-100">
            {dir.label}
          </span>
          <span className="mt-0.5 block truncate font-mono text-[11px] text-zinc-400">
            {getDirectorySubtitle(dir)}
          </span>
        </button>
      </span>
      <span role="gridcell" aria-colindex={3} className="hidden min-w-0 sm:block" />
      <span role="gridcell" aria-colindex={4} />
      <span role="gridcell" aria-colindex={5} className="flex justify-center">
        <ChevronRight className="size-4 text-zinc-600 transition-transform group-hover:translate-x-0.5 group-hover:text-zinc-400" />
      </span>
      {desktop ? <span role="gridcell" aria-colindex={6} /> : null}
      {folderJanitorEnabled && onScanFolder ? (
        <span role="presentation" className="sr-only">
          <Scan aria-hidden className="size-4" />
        </span>
      ) : null}
    </div>
  );
});

/** Folder-janitor scan action for the directory context menu. */
export function DirectoryScanAction({
  dir,
  onScanFolder,
}: {
  dir: FileTableDirectory;
  onScanFolder?: (folderPath: string) => void;
}) {
  if (!onScanFolder) return null;
  return (
    <MenuItem icon={<Scan />} onClick={() => onScanFolder(dir.absolutePath)}>
      Scan Folder for Issues
    </MenuItem>
  );
}