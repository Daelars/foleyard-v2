"use client";

import { useVirtualizer } from "@tanstack/react-virtual";
import { useRef } from "react";
import { Heart, ChevronRight, Play, Folder, ChevronLeft, ListMusic } from "lucide-react";
import { cn, formatDuration } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface FileRecord {
  id: string;
  filename: string;
  path: string;
  directory: string | null;
  format: string | null;
  duration: number | null;
  fileSize: number | null;
  isFavorite: boolean;
}

interface FileTableProps {
  files: FileRecord[];
  directories: string[];
  currentDirectory: string | null;
  currentPlaylistName?: string | null;
  onNavigate: (dir: string | null) => void;
  onNavigateLibrary?: () => void;
  selectedFileId: string | null;
  onSelect: (file: FileRecord, index: number) => void;
  onToggleFavorite: (id: string) => Promise<void>;
  searchQuery: string;
  isLoading: boolean;
}

function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query.trim()) return text;
  const parts = text.split(new RegExp(`(${query})`, "gi"));
  return parts.map((part, i) =>
    part.toLowerCase() === query.toLowerCase() ? (
      <mark key={i} className="bg-primary/30 text-primary-foreground rounded-sm px-0.5">
        {part}
      </mark>
    ) : (
      part
    ),
  );
}

export function FileTable({
  files,
  directories,
  currentDirectory,
  currentPlaylistName,
  onNavigate,
  onNavigateLibrary,
  selectedFileId,
  onSelect,
  onToggleFavorite,
  searchQuery,
  isLoading,
}: FileTableProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const items = [
    ...directories.map((d) => ({ type: "directory" as const, data: d })),
    ...files.map((f) => ({ type: "file" as const, data: f })),
  ];

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 64,
    overscan: 20,
  });

  const handleBack = () => {
    if (!currentDirectory) {
      onNavigateLibrary?.();
      return;
    }

    const parts = currentDirectory.split(/[\\/]/);
    parts.pop();
    onNavigate(parts.length > 0 ? parts.join("/") : null);
  };

  const handleNavigateLibrary = () => {
    if (onNavigateLibrary) {
      onNavigateLibrary();
      return;
    }

    onNavigate(null);
  };

  if (items.length === 0 && !isLoading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground p-8 text-center">
        <div className="size-16 bg-muted rounded-full flex items-center justify-center mb-4">
           <Play className="size-8 opacity-20" />
        </div>
        <h3 className="text-lg font-medium">No sounds found</h3>
        {(currentDirectory || currentPlaylistName) && (
          <Button variant="outline" size="sm" className="mt-4 gap-2" onClick={handleBack}>
            <ChevronLeft className="size-4" /> Go Back
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {(currentDirectory || currentPlaylistName) && !searchQuery && (
        <div className="px-6 py-2 border-b border-border bg-muted/20 flex items-center gap-2">
           <Button variant="ghost" size="icon" className="size-7 rounded-full" onClick={handleBack}>
             <ChevronLeft className="size-4" />
           </Button>
           <div className="flex items-center gap-1 text-xs font-medium text-muted-foreground overflow-hidden">
              <span className="cursor-pointer hover:text-foreground" onClick={handleNavigateLibrary}>Library</span>
              {currentDirectory ? currentDirectory.split(/[\\/]/).map((part, i, arr) => (
                <span key={i} className="flex items-center gap-1">
                  <span className="opacity-40">/</span>
                  <span 
                    className={cn("cursor-pointer hover:text-foreground truncate max-w-[150px]", i === arr.length - 1 && "text-foreground font-bold")}
                    onClick={() => onNavigate(arr.slice(0, i + 1).join("/"))}
                  >
                    {part}
                  </span>
                </span>
              )) : null}
              {currentPlaylistName ? (
                <>
                  <span className="opacity-40">/</span>
                  <span className="flex items-center gap-1 text-foreground font-bold truncate max-w-[220px]">
                    <ListMusic className="size-3" />
                    {currentPlaylistName}
                  </span>
                </>
              ) : null}
           </div>
        </div>
      )}

      <div ref={parentRef} className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-border">
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: "100%",
            position: "relative",
          }}
        >
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const item = items[virtualRow.index];
            
            if (item.type === "directory") {
              const dir = item.data;
              const label = dir.split(/[\\/]/).pop() || dir;
              
              return (
                <div
                  key={`dir-${dir}`}
                  className="absolute top-0 left-0 w-full flex items-center gap-4 px-4 py-2 border-b border-border/40 hover:bg-accent/40 transition-colors group cursor-pointer"
                  style={{ height: `64px`, transform: `translateY(${virtualRow.start}px)` }}
                  onClick={() => onNavigate(dir)}
                >
                  <div className="shrink-0 size-10 flex items-center justify-center">
                    <Folder className="size-5 text-primary/60 group-hover:text-primary transition-colors fill-primary/5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="truncate text-sm font-semibold">{label}</div>
                    <div className="text-[10px] text-muted-foreground uppercase font-bold tracking-tight mt-0.5">Folder</div>
                  </div>
                  <ChevronRight className="size-4 text-muted-foreground mr-2 group-hover:translate-x-1 transition-transform" />
                </div>
              );
            }

            const file = item.data;
            const isSelected = selectedFileId === file.id;

            return (
              <div
                key={`file-${file.id}`}
                className={cn(
                  "absolute top-0 left-0 w-full flex items-center gap-4 px-4 py-2 border-b border-border/40 transition-colors group cursor-pointer",
                  isSelected ? "bg-accent/80" : "hover:bg-accent/40"
                )}
                style={{
                  height: `64px`,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
                onClick={() => onSelect(file, virtualRow.index)}
              >
                <div className="shrink-0 size-10 flex items-center justify-center">
                  <Play className={cn(
                    "size-4 transition-all",
                    isSelected ? "text-primary fill-current" : "text-muted-foreground/60 group-hover:text-muted-foreground"
                  )} />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-foreground group-hover:text-primary transition-colors">
                    {highlightMatch(file.filename, searchQuery)}
                  </div>
                  <div className="mt-1 flex items-center gap-3 text-[10px] text-muted-foreground uppercase font-semibold tracking-wider">
                    <span className="bg-muted px-1.5 py-0.5 rounded text-[9px]">{file.format ?? "???"}</span>
                    <span>{formatDuration(file.duration)}</span>
                  </div>
                </div>

                <div className="shrink-0 flex items-center gap-3">
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Button
                          variant="ghost"
                          size="icon"
                          className={cn(
                            "size-8 rounded-full transition-all",
                            file.isFavorite
                              ? "text-red-500 hover:text-red-600 bg-red-500/10 hover:bg-red-500/20"
                              : "text-muted-foreground/60 hover:text-muted-foreground hover:bg-accent"
                          )}
                          onClick={(e) => {
                            e.stopPropagation();
                            onToggleFavorite(file.id);
                          }}
                        >
                          <Heart
                            className={cn("size-4", file.isFavorite && "fill-current")}
                          />
                        </Button>
                      }
                    />
                    <TooltipContent>
                      {file.isFavorite ? "Remove from favorites" : "Add to favorites"}
                    </TooltipContent>
                  </Tooltip>

                  <ChevronRight className={cn(
                    "size-4 text-muted-foreground transition-transform",
                    isSelected ? "translate-x-1 text-primary" : "group-hover:translate-x-0.5"
                  )} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
