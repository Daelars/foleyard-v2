"use client";

import { useVirtualizer } from "@tanstack/react-virtual";
import { useRef } from "react";

import { FileTableBreadcrumbBar } from "@/components/FileTable/breadcrumb-bar";
import { useFileTableDesktopActions } from "@/components/FileTable/desktop-actions";
import { FileTableDirectoryRow } from "@/components/FileTable/directory-row";
import { FileTableEmptyState } from "@/components/FileTable/empty-state";
import { FileTableFileRow } from "@/components/FileTable/file-row";
import type { FileTableProps } from "@/components/FileTable/types";

export type { FileTableProps } from "@/components/FileTable/types";

export function FileTable({
  files,
  directories,
  currentDirectory,
  currentPlaylistName,
  onNavigate,
  onNavigateLibrary,
  selectedFileId,
  isSelectedFilePlaying = false,
  onSelect,
  onToggleFavorite,
  searchQuery,
  isLoading,
  soundShelfEnabled = false,
  makePackEnabled = false,
  onMakePackFile,
  folderJanitorEnabled = false,
  onScanFolder,
}: FileTableProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const desktopActions = useFileTableDesktopActions(onSelect);
  const items = [
    ...directories.map((directory) => ({ type: "directory" as const, data: directory })),
    ...files.map((file) => ({ type: "file" as const, data: file })),
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
      <FileTableEmptyState
        currentDirectory={currentDirectory}
        currentPlaylistName={currentPlaylistName}
        onBack={handleBack}
      />
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      {(currentDirectory || currentPlaylistName) && !searchQuery && (
        <FileTableBreadcrumbBar
          currentDirectory={currentDirectory}
          currentPlaylistName={currentPlaylistName}
          onBack={handleBack}
          onNavigate={onNavigate}
          onNavigateLibrary={handleNavigateLibrary}
        />
      )}

      <div
        ref={parentRef}
        className="foleyard-library-scroll flex-1 overflow-y-auto"
      >
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
              return (
                <FileTableDirectoryRow
                  key={`dir-${item.data}`}
                  dir={item.data}
                  start={virtualRow.start}
                  onNavigate={onNavigate}
                  folderJanitorEnabled={folderJanitorEnabled}
                  onScanFolder={onScanFolder}
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
                isSelectedFilePlaying={isSelectedFilePlaying}
                onSelect={onSelect}
                onToggleFavorite={onToggleFavorite}
                onMakePackFile={onMakePackFile}
                searchQuery={searchQuery}
                showDesktopActions={showDesktopActions}
                makePackEnabled={makePackEnabled}
                soundShelfEnabled={soundShelfEnabled}
                start={virtualRow.start}
                virtualIndex={virtualRow.index}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
