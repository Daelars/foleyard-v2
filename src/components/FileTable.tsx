"use client";

import { useVirtualizer } from "@tanstack/react-virtual";
import { memo, useEffect, useMemo, useRef, type KeyboardEvent } from "react";

import { FileTableBreadcrumbBar } from "@/components/FileTable/breadcrumb-bar";
import { useFileTableDesktopActions } from "@/components/FileTable/desktop-actions";
import { FileTableDirectoryRow } from "@/components/FileTable/directory-row";
import { FileTableEmptyState } from "@/components/FileTable/empty-state";
import { FileTableFileRow } from "@/components/FileTable/file-row";
import { fileTableGridClass } from "@/components/FileTable/layout";
import { resolveSelectionScrollIndex } from "@/components/FileTable/selection-scroll";
import type { FileTableProps } from "@/components/FileTable/types";
import { navigateToParent } from "@/lib/directory-navigation";
import { cn } from "@/lib/utils";

export type { FileTableProps } from "@/components/FileTable/types";

export const FileTable = memo(function FileTable({
  files,
  directories,
  currentDirectory,
  currentCollectionName,
  onNavigate,
  onNavigateLibrary,
  selectedFileId,
  selectedIds = [],
  isSelectedFilePlaying = false,
  onSelect,
  onToggleFavorite,
  searchQuery,
  isLoading,
  hasMore = false,
  onLoadMore,
  showContainerBorder = true,
  soundShelfEnabled = false,
  shelfFileIds = [],
  makePackEnabled = false,
  onMakePackFile,
  onRemoveFile,
  folderJanitorEnabled = false,
  onScanFolder,
  allTags,
  onToggleFileTag,
  sortKey,
  sortDir,
  onFlipSort,
}: FileTableProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const desktopActions = useFileTableDesktopActions(onSelect, selectedIds);
  const items = useMemo(
    () => [
      ...directories.map((directory) => ({ type: "directory" as const, data: directory })),
      ...files.map((file) => ({ type: "file" as const, data: file })),
    ],
    [directories, files],
  );
  const shelfFileIdSet = useMemo(() => new Set(shelfFileIds), [shelfFileIds]);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 64,
    overscan: 20,
  });

  const handleBack = () => {
    if (!currentDirectory || currentDirectory.directory === null) {
      onNavigateLibrary?.();
      return;
    }

    onNavigate(navigateToParent(currentDirectory));
  };

  const handleNavigateLibrary = () => {
    if (onNavigateLibrary) {
      onNavigateLibrary();
      return;
    }

    onNavigate(null);
  };

  const handleRowKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const row = (event.target as HTMLElement).closest<HTMLElement>(
      "[data-file-id]",
    );

    if (!row?.dataset.fileId || files.length === 0) {
      return;
    }

    const index = files.findIndex((file) => file.id === row.dataset.fileId);

    if (index === -1) {
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect(files[index], index);
      return;
    }

    if (event.key !== "j" && event.key !== "k") {
      return;
    }

    event.preventDefault();
    const nextIndex = (index + (event.key === "j" ? 1 : -1) + files.length) % files.length;
    const neighbor = files[nextIndex];
    virtualizer.scrollToIndex(directories.length + nextIndex, { align: "auto" });
    onSelect(neighbor, nextIndex);
    requestAnimationFrame(() => {
    const neighborRow = parentRef.current?.querySelector<HTMLElement>(
      `[data-file-id="${neighbor.id}"]`,
    );
    neighborRow?.focus();
    });
  };

  // Viewport follows genuine selection changes only. The effect keys on the
  // selected id (not the file array, whose identity churns on every
  // optimistic update, favourite toggle, or page append), so favouriting a
  // row while scrolled elsewhere leaves the viewport alone while keyboard
  // selection still scrolls to the newly selected row.
  const filesRef = useRef(files);
  useEffect(() => {
    filesRef.current = files;
  }, [files]);
  const prevSelectedFileIdRef = useRef<string | null>(null);
  useEffect(() => {
    const target = resolveSelectionScrollIndex({
      files: filesRef.current,
      directoryCount: directories.length,
      selectedFileId,
      prevSelectedFileId: prevSelectedFileIdRef.current,
    });
    prevSelectedFileIdRef.current = selectedFileId;
    if (target !== null) {
      virtualizer.scrollToIndex(target, { align: "auto" });
    }
  }, [directories.length, selectedFileId, virtualizer]);

  if (items.length === 0 && !isLoading) {
    return (
      <FileTableEmptyState
        currentDirectory={currentDirectory}
        currentCollectionName={currentCollectionName}
        searchQuery={searchQuery}
        onBack={handleBack}
      />
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col px-4 pb-4 md:px-5">
      {(currentDirectory || currentCollectionName) && !searchQuery && (
        <FileTableBreadcrumbBar
          currentDirectory={currentDirectory}
          currentCollectionName={currentCollectionName}
          onBack={handleBack}
          onNavigate={onNavigate}
          onNavigateLibrary={handleNavigateLibrary}
        />
      )}

      {items.length > 0 && (
        <div
          className={`mt-4 mb-4 grid items-center gap-3 border-b border-white/10 px-3 pb-2 font-mono text-[11px] font-semibold uppercase tracking-widest text-zinc-400 ${fileTableGridClass(desktopActions.desktop)}`}
        >
          <span />
          <button
            type="button"
            onClick={() => onFlipSort("filename")}
            className="text-left transition-colors hover:text-accent-text"
          >
            Name{" "}
            {sortKey === "filename" ? (sortDir === 1 ? "↑ " : "↓ ") : ""}
          </button>
          <span className="hidden sm:block">Wave</span>
          <button
            type="button"
            onClick={() => onFlipSort("duration")}
            className="text-right transition-colors hover:text-accent-text"
          >
            Time{" "}
            {sortKey === "duration" ? (sortDir === 1 ? "↑ " : "↓ ") : ""}
          </button>
          <span />
          {desktopActions.desktop ? <span /> : null}
        </div>
      )}

      <div
        ref={parentRef}
        className="foleyard-library-scroll min-h-0 flex-1 overflow-y-auto"
        onKeyDown={handleRowKeyDown}
        onScroll={() => {
          const viewport = parentRef.current;
          if (
            hasMore &&
            viewport &&
            viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 640
          ) {
            onLoadMore?.();
          }
        }}
      >
        <div
          className={cn(
            "overflow-hidden rounded-2xl bg-white/[0.03]",
            showContainerBorder && "border border-white/10",
          )}
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: "100%",
            position: "relative",
          }}
        >
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const item = items[virtualRow.index];

            if (item.type === "directory") {
              return (
                <FileTableDirectoryRow
                  key={`dir-${item.data.key}`}
                  dir={item.data}
                  start={virtualRow.start}
                  onNavigate={onNavigate}
                  folderJanitorEnabled={folderJanitorEnabled}
                  onScanFolder={onScanFolder}
                  desktop={desktopActions.desktop}
                />
              );
            }

            const file = item.data;
            const isSelected = selectedFileId === file.id;
            const isDragging = desktopActions.draggingFile === file.id;
            const showDesktopActions = desktopActions.desktop && (isSelected || isDragging);

            return (
              <FileTableFileRow
                key={`file-${file.id}`}
                desktop={desktopActions.desktop}
                file={file}
                handleCopyPath={desktopActions.handleCopyPath}
                handleDragEnd={desktopActions.handleDragEnd}
                handleNativeDragStart={desktopActions.handleNativeDragStart}
                isDragging={isDragging}
                isSelected={isSelected}
                isMultiSelected={selectedIds.includes(file.id)}
                isSelectedFilePlaying={isSelectedFilePlaying}
                onSelect={onSelect}
                onToggleFavorite={onToggleFavorite}
                onMakePackFile={onMakePackFile}
                searchQuery={searchQuery}
                showDesktopActions={showDesktopActions}
                makePackEnabled={makePackEnabled}
                soundShelfEnabled={soundShelfEnabled}
                inShelf={shelfFileIdSet.has(file.id)}
                start={virtualRow.start}
                virtualIndex={virtualRow.index}
                allTags={allTags}
                onToggleFileTag={onToggleFileTag}
                onRemoveFile={onRemoveFile}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
});
