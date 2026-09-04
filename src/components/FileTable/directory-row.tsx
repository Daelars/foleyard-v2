"use client";

import { memo } from "react";
import { ChevronRight, Folder, Scan } from "lucide-react";

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";

export const FileTableDirectoryRow = memo(function FileTableDirectoryRow({
  dir,
  start,
  onNavigate,
  folderJanitorEnabled,
  onScanFolder,
  desktop = false,
}: {
  dir: string;
  start: number;
  onNavigate: (dir: string) => void;
  folderJanitorEnabled?: boolean;
  onScanFolder?: (folderPath: string) => void;
  desktop?: boolean;
}) {
  const label = dir.split(/[\\/]/).pop() || dir;

  const row = (
    <div
      className={`group absolute left-0 top-0 grid w-full cursor-pointer items-center gap-3 border-b border-white/5 px-3 outline-none transition-[background-color,color] last:border-0 hover:bg-white/[0.04] ${
        desktop
          ? "grid-cols-[28px_28px_minmax(0,1fr)_64px_28px_28px] sm:grid-cols-[28px_28px_minmax(0,1fr)_140px_64px_28px_28px]"
          : "grid-cols-[28px_28px_minmax(0,1fr)_64px_28px] sm:grid-cols-[28px_28px_minmax(0,1fr)_140px_64px_28px]"
      }`}
      style={{
        height: "64px",
        transform: `translateY(${start}px)`,
      }}
      onClick={() => onNavigate(dir)}
    >
      <span />
      <span className="flex justify-center text-zinc-500">
        <Folder className="size-4" />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[15px] font-medium text-zinc-100">
          {label}
        </span>
        <span className="mt-0.5 block truncate font-mono text-[11px] text-zinc-400">
          Folder
        </span>
      </span>
      <span className="hidden min-w-0 sm:block" />
      <span />
      <span className="flex justify-center">
        <ChevronRight className="size-4 text-zinc-600 transition-transform group-hover:translate-x-0.5 group-hover:text-zinc-400" />
      </span>
      {desktop ? <span /> : null}
    </div>
  );

  if (!folderJanitorEnabled || !onScanFolder) {
    return row;
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger>{row}</ContextMenuTrigger>
      <ContextMenuContent className="w-44">
        <ContextMenuItem onClick={() => onScanFolder(dir)}>
          <Scan className="size-4" />
          Scan Folder for Issues
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
});
