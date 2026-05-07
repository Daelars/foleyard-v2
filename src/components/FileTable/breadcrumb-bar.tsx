"use client";

import { ChevronLeft, ListMusic } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function FileTableBreadcrumbBar({
  currentDirectory,
  currentPlaylistName,
  onBack,
  onNavigate,
  onNavigateLibrary,
}: {
  currentDirectory: string | null;
  currentPlaylistName?: string | null;
  onBack: () => void;
  onNavigate: (dir: string | null) => void;
  onNavigateLibrary: () => void;
}) {
  return (
    <div className="flex items-center gap-2 border-b border-border/70 bg-card/35 px-6 py-2 backdrop-blur-xl">
      <Button
        variant="ghost"
        size="icon"
        className="size-7 rounded-full"
        onClick={onBack}
      >
        <ChevronLeft className="size-4" />
      </Button>
      <div className="flex items-center gap-1 overflow-hidden text-xs font-medium text-muted-foreground">
        <span
          className="cursor-pointer hover:text-foreground"
          onClick={onNavigateLibrary}
        >
          Library
        </span>
        {currentDirectory
          ? currentDirectory.split(/[\\/]/).map((part, index, allParts) => (
              <span key={index} className="flex items-center gap-1">
                <span className="opacity-40">/</span>
                <span
                  className={cn(
                    "max-w-[150px] cursor-pointer truncate hover:text-foreground",
                    index === allParts.length - 1 && "font-bold text-foreground",
                  )}
                  onClick={() => onNavigate(allParts.slice(0, index + 1).join("/"))}
                >
                  {part}
                </span>
              </span>
            ))
          : null}
        {currentPlaylistName ? (
          <>
            <span className="opacity-40">/</span>
            <span className="flex max-w-[220px] items-center gap-1 truncate font-bold text-foreground">
              <ListMusic className="size-3" />
              {currentPlaylistName}
            </span>
          </>
        ) : null}
      </div>
    </div>
  );
}
