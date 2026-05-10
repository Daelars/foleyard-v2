"use client";

import { ChevronRight, Folder, Scan } from "lucide-react";

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";

export function FileTableDirectoryRow({
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
      className="group absolute left-0 top-0 flex w-full cursor-pointer items-center gap-4 border-b border-border/35 px-4 py-2 transition-[background-color,color] hover:bg-accent/50 hover:text-accent-foreground hover:backdrop-blur"
      style={{
        height: "64px",
        transform: `translateY(${start}px)`,
      }}
      onClick={() => onNavigate(dir)}
    >
      <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/15">
        <Folder className="size-5 fill-primary/5 transition-colors group-hover:text-primary" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold">{label}</div>
        <div className="mt-0.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70">
          Folder
        </div>
      </div>
      <ChevronRight className="mr-2 size-4 text-muted-foreground transition-transform group-hover:translate-x-1" />
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
}
