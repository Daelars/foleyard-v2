"use client";

import { ChevronLeft, ListMusic } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  basename,
  navigateToRoot,
  navigateToSegment,
} from "@/lib/directory-navigation";
import { cn } from "@/lib/utils";
import type { FileTableDirectory } from "./types";

export function FileTableBreadcrumbBar({
  currentDirectory,
  currentCollectionName,
  onBack,
  onNavigate,
  onNavigateLibrary,
}: {
  currentDirectory: FileTableDirectory | null;
  currentCollectionName?: string | null;
  onBack: () => void;
  onNavigate: (dir: FileTableDirectory | null) => void;
  onNavigateLibrary: () => void;
}) {
  return (
    <div className="flex items-center gap-2 border-b border-white/5 px-6 py-2">
      <Button
        variant="ghost"
        size="icon"
        className="size-7 rounded-full text-zinc-400 hover:bg-white/5 hover:text-zinc-100"
        onClick={onBack}
      >
        <ChevronLeft className="size-4" />
      </Button>
      <div className="flex items-center gap-1 overflow-hidden text-xs font-medium text-zinc-400">
        <span
          className="cursor-pointer transition-colors hover:text-accent-text"
          onClick={onNavigateLibrary}
        >
          Library
        </span>
        {currentDirectory?.showRoot ? (
          <span className="flex items-center gap-1">
            <span className="opacity-40">/</span>
            <span
              className={cn(
                "max-w-[150px] cursor-pointer truncate transition-colors hover:text-accent-text",
                currentDirectory.directory === null && "font-bold text-zinc-100",
              )}
              onClick={() => onNavigate(navigateToRoot(currentDirectory))}
            >
              {basename(currentDirectory.libraryRoot)}
            </span>
          </span>
        ) : null}
        {currentDirectory?.directory
          ? currentDirectory.directory.split(/[\\/]/).map((part, index, allParts) => (
              <span key={index} className="flex items-center gap-1">
                <span className="opacity-40">/</span>
                <span
                  className={cn(
                    "max-w-[150px] cursor-pointer truncate transition-colors hover:text-accent-text",
                    index === allParts.length - 1 && "font-bold text-zinc-100",
                  )}
                  onClick={() => {
                    onNavigate(
                      navigateToSegment(currentDirectory, allParts, index),
                    );
                  }}
                >
                  {part}
                </span>
              </span>
            ))
          : null}
        {currentCollectionName ? (
          <>
            <span className="opacity-40">/</span>
            <span className="flex max-w-[220px] items-center gap-1 truncate font-bold text-zinc-100">
              <ListMusic className="size-3" />
              {currentCollectionName}
            </span>
          </>
        ) : null}
      </div>
    </div>
  );
}
