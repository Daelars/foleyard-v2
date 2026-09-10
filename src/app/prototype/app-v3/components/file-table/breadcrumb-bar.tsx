"use client";

// app-v3 adapter for FileTableBreadcrumbBar: same navigation contract,
// I breadcrumb treatment (mono crumbs with chevrons, back button).
import { ChevronLeft, ListMusic } from "lucide-react";

import { Button } from "@/components/variant-i";
import {
  basename,
  navigateToRoot,
  navigateToSegment,
} from "@/lib/directory-navigation";
import { cn } from "@/lib/utils";
import type { FileTableDirectory } from "@/components/FileTable/types";

export function V3BreadcrumbBar({
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
    <div className="flex items-center gap-2 border-b border-[var(--vi-edge)] px-6 py-2">
      <Button
        tone="ghost"
        size="icon"
        className="size-7 rounded-full"
        aria-label="Go back"
        onClick={onBack}
      >
        <ChevronLeft className="size-4" />
      </Button>
      <nav
        aria-label="Breadcrumb"
        className="flex items-center gap-1 overflow-hidden font-mono text-[11px] text-zinc-400"
      >
        <span
          className="cursor-pointer rounded px-1 py-0.5 outline-none transition-colors hover:bg-white/[0.05] hover:text-zinc-200 focus-visible:ring-2 focus-visible:ring-[var(--vi-focus)]"
          onClick={onNavigateLibrary}
        >
          Library
        </span>
        {currentDirectory?.showRoot ? (
          <span className="flex items-center gap-1">
            <ChevronRightIcon />
            <span
              className={cn(
                "max-w-[150px] cursor-pointer truncate rounded px-1 py-0.5 outline-none transition-colors hover:bg-white/[0.05] hover:text-zinc-200 focus-visible:ring-2 focus-visible:ring-[var(--vi-focus)]",
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
                <ChevronRightIcon />
                <span
                  className={cn(
                    "max-w-[150px] cursor-pointer truncate rounded px-1 py-0.5 outline-none transition-colors hover:bg-white/[0.05] hover:text-zinc-200 focus-visible:ring-2 focus-visible:ring-[var(--vi-focus)]",
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
            <ChevronRightIcon />
            <span className="flex max-w-[220px] items-center gap-1 truncate font-bold text-zinc-100">
              <ListMusic className="size-3" />
              {currentCollectionName}
            </span>
          </>
        ) : null}
      </nav>
    </div>
  );
}

function ChevronRightIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden
      className="size-3 shrink-0 text-zinc-700"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6 4l4 4-4 4" />
    </svg>
  );
}