"use client";

import { ChevronRight, Folder } from "lucide-react";

export function FileTableDirectoryRow({
  dir,
  start,
  onNavigate,
}: {
  dir: string;
  start: number;
  onNavigate: (dir: string) => void;
}) {
  const label = dir.split(/[\\/]/).pop() || dir;

  return (
    <div
      className="group absolute left-0 top-0 flex w-full cursor-pointer items-center gap-4 border-b border-border/35 px-4 py-2 transition-colors hover:bg-card/65 hover:backdrop-blur"
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
        <div className="mt-0.5 text-[10px] font-bold uppercase tracking-tight text-muted-foreground">
          Folder
        </div>
      </div>
      <ChevronRight className="mr-2 size-4 text-muted-foreground transition-transform group-hover:translate-x-1" />
    </div>
  );
}
