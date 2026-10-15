"use client";

// app-v3 adapter for FileTableBreadcrumbBar: same navigation contract,
// I breadcrumb treatment (mono crumbs with chevrons, back button).
//
// The nav advertises breadcrumb semantics, so every navigable segment is a
// real button — focusable and keyboard-reachable, rather than a span that only
// looked clickable — and the current location is announced with aria-current
// instead of being conveyed by bold styling alone.
import { ChevronLeft, ListMusic } from "lucide-react";

import { Button } from "@/components/variant-i";
import {
  basename,
  navigateToRoot,
  navigateToSegment,
} from "@/lib/directory-navigation";
import { cn } from "@/lib/utils";
import type { FileTableDirectory } from "@/components/FileTable/types";

const CRUMB =
  "rounded px-1 py-0.5 outline-none transition-colors hover:bg-white/[0.05] hover:text-zinc-200 focus-visible:ring-2 focus-visible:ring-[var(--vi-focus)]";

function CrumbButton({
  label,
  current,
  onClick,
}: {
  label: string;
  current: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      // The full name is otherwise lost to the 150px clamp, for mouse and
      // keyboard users alike.
      title={label}
      aria-current={current ? "page" : undefined}
      className={cn(
        CRUMB,
        "max-w-[150px] truncate",
        current ? "font-bold text-zinc-100" : "text-zinc-400",
      )}
    >
      {label}
    </button>
  );
}

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
  const parts = currentDirectory?.directory
    ? currentDirectory.directory.split(/[\\/]/)
    : [];

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
        <button
          type="button"
          onClick={onNavigateLibrary}
          aria-current={
            !currentDirectory?.showRoot && parts.length === 0 && !currentCollectionName
              ? "page"
              : undefined
          }
          className={cn(
            CRUMB,
            !currentDirectory?.showRoot && parts.length === 0 && !currentCollectionName
              ? "font-bold text-zinc-100"
              : "text-zinc-400",
          )}
        >
          Library
        </button>
        {currentDirectory?.showRoot ? (
          <span className="flex items-center gap-1">
            <ChevronRightIcon />
            <CrumbButton
              label={basename(currentDirectory.libraryRoot)}
              current={parts.length === 0 && !currentCollectionName}
              onClick={() => onNavigate(navigateToRoot(currentDirectory))}
            />
          </span>
        ) : null}
        {currentDirectory?.directory
          ? parts.map((part, index) => (
              <span key={index} className="flex items-center gap-1">
                <ChevronRightIcon />
                <CrumbButton
                  label={part}
                  current={index === parts.length - 1 && !currentCollectionName}
                  onClick={() => {
                    onNavigate(
                      navigateToSegment(currentDirectory, parts, index),
                    );
                  }}
                />
              </span>
            ))
          : null}
        {currentCollectionName ? (
          <>
            <ChevronRightIcon />
            {/* The collection is the current page but not a navigation target,
                so it carries the current-location semantics without pretending
                to be a button. */}
            <span
              aria-current="page"
              title={currentCollectionName}
              className="flex max-w-[220px] items-center gap-1 truncate font-bold text-zinc-100"
            >
              <ListMusic aria-hidden className="size-3" />
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
