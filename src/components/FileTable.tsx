"use client";

import { useVirtualizer } from "@tanstack/react-virtual";
import { memo, useMemo, useRef, type KeyboardEvent } from "react";

import { FileTableBreadcrumbBar } from "@/components/FileTable/breadcrumb-bar";
import { useFileTableDesktopActions } from "@/components/FileTable/desktop-actions";
import { FileTableDirectoryRow } from "@/components/FileTable/directory-row";
import { FileTableEmptyState } from "@/components/FileTable/empty-state";
import { FileTableFileRow } from "@/components/FileTable/file-row";
import type { FileTableProps } from "@/components/FileTable/types";

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
  onToggleSelect,
  onToggleFavorite,
  searchQuery,
  isLoading,
  soundShelfEnabled = false,
  makePackEnabled = false,
  onMakePackFile,
  folderJanitorEnabled = false,
  onScanFolder,
  allTags,
  onToggleFileTag,
  sortKey,
  sortDir,
  onFlipSort,
}: FileTableProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const desktopActions = useFileTableDesktopActions(onSelect);
  const items = useMemo(
    () => [
      ...directories.map((directory) => ({ type: "directory" as const, data: directory })),
      ...files.map((file) => ({ type: "file" as const, data: file })),
    ],
    [directories, files],
  );

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
    const neighbor =
      files[(index + (event.key === "j" ? 1 : -1) + files.length) % files.length];
    const neighborRow = parentRef.current?.querySelector<HTMLElement>(
      `[data-file-id="${neighbor.id}"]`,
    );
    onSelect(neighbor, index);
    neighborRow?.focus();
  };

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
          className={`grid items-center gap-3 border-b border-white/10 px-3 pb-2 font-mono text-[11px] font-semibold uppercase tracking-widest text-zinc-400 ${
            desktopActions.desktop
              ? "grid-cols-[28px_28px_minmax(0,1fr)_64px_28px_28px]"
              : "grid-cols-[28px_28px_minmax(0,1fr)_64px_28px]"
          }`}
        >
          <span />
          <span />
          <button
            type="button"
            onClick={() => onFlipSort("filename")}
            className="text-left transition-colors hover:text-accent-text"
          >
            Name{" "}
            {sortKey === "filename" ? (sortDir === 1 ? "↑ " : "↓ ") : ""}
          </button>
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
      >
        <div
          className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]"
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
                  key={`dir-${item.data}`}
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
                handleOpenFile={desktopActions.handleOpenFile}
                handleRevealInExplorer={desktopActions.handleRevealInExplorer}
                isDragging={isDragging}
                isSelected={isSelected}
                isMultiSelected={selectedIds.includes(file.id)}
                isSelectedFilePlaying={isSelectedFilePlaying}
                onSelect={onSelect}
                onToggleSelect={onToggleSelect}
                onToggleFavorite={onToggleFavorite}
                onMakePackFile={onMakePackFile}
                searchQuery={searchQuery}
                showDesktopActions={showDesktopActions}
                makePackEnabled={makePackEnabled}
                soundShelfEnabled={soundShelfEnabled}
                start={virtualRow.start}
                virtualIndex={virtualRow.index}
                allTags={allTags}
                onToggleFileTag={onToggleFileTag}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
});
