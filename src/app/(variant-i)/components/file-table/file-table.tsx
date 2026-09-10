"use client";

// app-v3 adapter for FileTable: same virtualized list, selection,
// keyboard, scroll-to-selected, load-more and desktop-drag behavior; rows,
// breadcrumbs, empty state and menus use the variant I treatment.
import { useVirtualizer } from "@tanstack/react-virtual";
import { memo, useCallback, useEffect, useMemo, useRef, type KeyboardEvent } from "react";

import { useFileTableDesktopActions } from "@/components/FileTable/desktop-actions";
import { fileTableGridClass } from "@/components/FileTable/layout";
import { resolveSelectionScrollIndex } from "@/components/FileTable/selection-scroll";
import { useShelfToggle } from "@/components/FileTable/use-shelf-toggle";
import { navigateToParent } from "@/lib/directory-navigation";
import { cn } from "@/lib/utils";
import type { FileTableProps } from "@/components/FileTable/types";

import { V3BreadcrumbBar } from "./breadcrumb-bar";
import { V3DirectoryRow, DirectoryScanAction } from "./directory-row";
import { V3EmptyState } from "./empty-state";
import { V3FileRow } from "./file-row";
import { V3RowMenuItems } from "./row-menu";
import { RowContextMenu, useRowContextMenu } from "../context-menu";
import { MenuSeparator } from "@/components/variant-i";

export type { FileTableProps } from "@/components/FileTable/types";

type MenuTarget =
  | { kind: "file"; file: FileTableProps["files"][number] }
  | { kind: "directory"; dir: FileTableProps["directories"][number] };

export const V3FileTable = memo(function V3FileTable({
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
  resolveV2FileItems,
  onV2Command,
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
  const rowMenu = useRowContextMenu<MenuTarget>();

  // Stable handlers so the memo'd row components keep their memo (an
  // inline closure per row would defeat it and re-render every visible
  // row on every table re-render).
  const handleFileContextMenu = useCallback(
    (event: React.MouseEvent, file: FileTableProps["files"][number]) => {
      rowMenu.openMenu({ kind: "file", file }, event.clientX, event.clientY);
    },
    [rowMenu.openMenu],
  );
  const handleDirectoryContextMenu = useCallback(
    (event: React.MouseEvent, dir: FileTableProps["directories"][number]) => {
      rowMenu.openMenu({ kind: "directory", dir }, event.clientX, event.clientY);
    },
    [rowMenu.openMenu],
  );

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

  const menuFilename = (file: FileTableProps["files"][number]) => {
    const extensionIndex = file.filename.lastIndexOf(".");
    const filenameWithoutExtension =
      extensionIndex > 0 && extensionIndex < file.filename.length - 1
        ? file.filename.slice(0, extensionIndex)
        : file.filename;
    return filenameWithoutExtension
      .replaceAll("_", " ")
      .replace(/\s+/g, " ")
      .trim();
  };

  const menuLabel =
    rowMenu.menu?.item.kind === "file"
      ? menuFilename(rowMenu.menu.item.file)
      : rowMenu.menu?.item.kind === "directory"
        ? rowMenu.menu.item.dir.label
        : "";

  if (items.length === 0 && !isLoading) {
    return (
      <V3EmptyState
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
        <V3BreadcrumbBar
          currentDirectory={currentDirectory}
          currentCollectionName={currentCollectionName}
          onBack={handleBack}
          onNavigate={onNavigate}
          onNavigateLibrary={handleNavigateLibrary}
        />
      )}

      {items.length > 0 && (
        <div
          className={cn(
            "mt-4 mb-4 grid items-center gap-3 border-b border-[var(--vi-edge)] px-3 pb-2 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500",
            fileTableGridClass(desktopActions.desktop),
          )}
        >
          <span />
          <button
            type="button"
            onClick={() => onFlipSort("filename")}
            className="text-left outline-none transition-colors hover:text-accent-text focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--vi-focus)]"
          >
            Name{" "}
            {sortKey === "filename" ? (sortDir === 1 ? "↑ " : "↓ ") : ""}
          </button>
          <span className="hidden sm:block">Wave</span>
          <button
            type="button"
            onClick={() => onFlipSort("duration")}
            className="text-right outline-none transition-colors hover:text-accent-text focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--vi-focus)]"
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
            "overflow-hidden rounded-lg border border-[var(--vi-edge)]",
            !showContainerBorder && "border-transparent",
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
                <V3DirectoryRow
                  key={`dir-${item.data.key}`}
                  dir={item.data}
                  start={virtualRow.start}
                  onNavigate={onNavigate}
                  folderJanitorEnabled={folderJanitorEnabled}
                  onScanFolder={onScanFolder}
                  desktop={desktopActions.desktop}
                  onContextMenu={handleDirectoryContextMenu}
                />
              );
            }

            const file = item.data;
            const isSelected = selectedFileId === file.id;
            const isDragging = desktopActions.draggingFile === file.id;
            const showDesktopActions = desktopActions.desktop && (isSelected || isDragging);

            return (
              <V3FileRow
                key={`file-${file.id}`}
                desktop={desktopActions.desktop}
                file={file}
                handleDragEnd={desktopActions.handleDragEnd}
                handleNativeDragStart={desktopActions.handleNativeDragStart}
                isDragging={isDragging}
                isSelected={isSelected}
                isMultiSelected={selectedIds.includes(file.id)}
                isSelectedFilePlaying={isSelectedFilePlaying}
                onSelect={onSelect}
                onToggleFavorite={onToggleFavorite}
                searchQuery={searchQuery}
                showDesktopActions={showDesktopActions}
                start={virtualRow.start}
                virtualIndex={virtualRow.index}
                onContextMenu={handleFileContextMenu}
              />
            );
          })}
        </div>
      </div>

      <RowContextMenu
        state={rowMenu.menu}
        onClose={rowMenu.closeMenu}
        label={menuLabel}
      >
        {(() => {
          const target = rowMenu.menu?.item;
          if (!target) return null;
          if (target.kind === "file") {
            return (
              <V3FileMenu
                file={target.file}
                handleCopyPath={desktopActions.handleCopyPath}
                onToggleFavorite={onToggleFavorite}
                makePackEnabled={makePackEnabled}
                onMakePackFile={onMakePackFile}
                soundShelfEnabled={soundShelfEnabled}
                inShelf={shelfFileIdSet.has(target.file.id)}
                onToggleShelf={rowMenu.closeMenu}
                allTags={allTags}
                onToggleFileTag={onToggleFileTag}
                onRemoveFile={onRemoveFile}
                resolveV2FileItems={resolveV2FileItems}
                onV2Command={
                  onV2Command ? (item) => onV2Command(item, target.file) : undefined
                }
              />
            );
          }
          return (
            <>
              <MenuSeparator />
              <DirectoryScanAction dir={target.dir} onScanFolder={onScanFolder} />
            </>
          );
        })()}
      </RowContextMenu>
    </div>
  );
});

function V3FileMenu({
  file,
  handleCopyPath,
  onToggleFavorite,
  makePackEnabled,
  onMakePackFile,
  soundShelfEnabled,
  inShelf,
  onToggleShelf,
  allTags,
  onToggleFileTag,
  onRemoveFile,
  resolveV2FileItems,
  onV2Command,
}: {
  file: FileTableProps["files"][number];
  handleCopyPath: (file: FileTableProps["files"][number]) => Promise<void>;
  onToggleFavorite: (id: string) => Promise<void>;
  makePackEnabled: boolean;
  onMakePackFile?: (file: FileTableProps["files"][number]) => Promise<void>;
  soundShelfEnabled: boolean;
  inShelf: boolean;
  onToggleShelf: () => void;
  allTags?: FileTableProps["allTags"];
  onToggleFileTag?: (fileId: string, tagId: string) => void;
  onRemoveFile?: (file: FileTableProps["files"][number]) => Promise<void>;
  resolveV2FileItems?: (fileId: string) => ReturnType<NonNullable<FileTableProps["resolveV2FileItems"]>>;
  onV2Command?: (item: Parameters<NonNullable<FileTableProps["onV2Command"]>>[0]) => void;
}) {
  const { toggleShelf } = useShelfToggle(file.id, inShelf);
  return (
    <>
      <V3RowMenuItems
        file={file}
        handleCopyPath={handleCopyPath}
        onToggleFavorite={onToggleFavorite}
        makePackEnabled={makePackEnabled}
        onMakePackFile={onMakePackFile}
        soundShelfEnabled={soundShelfEnabled}
        inShelf={inShelf}
        onToggleShelf={() => {
          void toggleShelf();
          onToggleShelf();
        }}
        allTags={allTags}
        onToggleFileTag={onToggleFileTag}
        onRemoveFile={onRemoveFile}
        v2Items={resolveV2FileItems?.(file.id) ?? []}
        onV2Command={onV2Command}
      />
    </>
  );
}