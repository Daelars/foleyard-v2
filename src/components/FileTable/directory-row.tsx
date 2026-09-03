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
}: {
  dir: string;
  start: number;
  onNavigate: (dir: string) => void;
  folderJanitorEnabled?: boolean;
  onScanFolder?: (folderPath: string) => void;
}) {
  const label = dir.split(/[\\/]/).pop() || dir;

  const row = (
    <div
      className="group absolute left-0 top-0 flex w-full cursor-pointer items-center gap-4 border-b border-white/5 px-4 py-2 transition-[background-color,color] hover:bg-white/[0.04]"
      style={{
        height: "64px",
        transform: `translateY(${start}px)`,
      }}
      onClick={() => onNavigate(dir)}
    >
      <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent-fill/12 text-accent-text ring-1 ring-accent-fill/20">
        <Folder className="size-5 fill-accent-fill/10 transition-colors group-hover:text-accent-text" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-zinc-100">{label}</div>
        <div className="mt-0.5 font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-500">
          Folder
        </div>
      </div>
      <ChevronRight className="mr-2 size-4 text-zinc-500 transition-transform group-hover:translate-x-1" />
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
