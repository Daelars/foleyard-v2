"use client";

import type { FileRecord } from "./library/types";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { PackagePlus, PanelLeft, Save, Search, X } from "lucide-react";

import { AudioPlayer, type AudioPlayerRef } from "@/components/AudioPlayer";
import { CommandPalette } from "@/components/CommandPalette/CommandPalette";
import { SelectionBulkBar } from "@/components/FileTable/bulk-bar";
import { DesktopTitleBar } from "@/components/DesktopTitleBar";
import { ExtensionGrid } from "@/components/ExtensionGrid";
import { FolderJanitorDialog } from "@/components/extensions/folder-janitor/FolderJanitorDialog";
import { LibraryGathererDialog } from "@/components/extensions/library-gatherer/LibraryGathererDialog";
import { MakePackDialog } from "@/components/extensions/make-pack/MakePackDialog";
import { OnboardingDialog } from "@/components/OnboardingDialog";
import { FileTable } from "@/components/FileTable";
import { OrganizeView } from "@/components/OrganizeView";
import { SettingsDialog } from "@/components/settings/SettingsDialog";
import { IconRail } from "@/components/IconRail";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { SOUND_SHELF_CHANGED_EVENT } from "@/lib/extensions/sound-shelf-events";
import { useExtensionCatalog } from "./library/use-extension-catalog";
import { useLibraryFiles } from "./library/use-library-files";
import { useLibraryOrganization } from "./library/use-library-organization";
import { useLibraryView } from "./library/use-library-view";
import { useSelection } from "./library/use-selection";
import { useBulkActions } from "./library/use-bulk-actions";
import { useSettingsScan } from "./library/use-settings-scan";
import { useExtensionUi } from "./library/use-extension-ui";
import { useTransport } from "./library/use-transport";
import { usePalette } from "./library/use-palette";
import { useShelf } from "./library/use-shelf";
import {
  ExtensionDetailsDialog,
  RenameCollectionDialog,
  SaveSearchDialog,
} from "./library/dialogs";
import { SCAN_SETTLE_SLICES, type RefetchSlice } from "./library/refetch-map";

export default function Home() {
  return <HomeContent />;
}

function HomeContent() {
  const audioPlayerRef = useRef<AudioPlayerRef>(null);

  // ---- Route shell: compose hooks, derive view memos, render. Fetches,
  // mutations, and dialog/selection/transport state live in
  // src/app/library/. Refs below break hook-order cycles; every cross-hook
  // side effect travels through an explicit callback. ----
  const selectionApiRef = useRef<{
    get: () => FileRecord | null;
    sync: (updater: (prev: FileRecord | null) => FileRecord | null) => void;
    clear: () => void;
    removeIds: (removedIds: Set<string>) => void;
    focus: (file: FileRecord) => void;
  }>({
    get: () => null,
    sync: () => {},
    clear: () => {},
    removeIds: () => {},
    focus: () => {},
  });
  const navigateRef = useRef(() => {});
  const scanSettledRef = useRef(() => {});
  const selectedCollectionMirrorRef = useRef<string | null>(null);

  const transport = useTransport();
  const { playIds, enqueue } = transport;

  const view = useLibraryView({
    onNavigate: () => navigateRef.current(),
  });
  const {
    currentView,
    selectedCollection,
    selectedTagId,
    selectedDirectory,
    searchQuery,
    setSearchQuery,
    debouncedSearchQuery,
    showLibrary,
    showFavorites,
    showShelf,
    showOrganize,
    handleFilterTag,
    navigateDirectory,
  } = view;
  useEffect(() => {
    selectedCollectionMirrorRef.current = selectedCollection;
  }, [selectedCollection]);

  const settingsScan = useSettingsScan({
    onScanSettled: () => scanSettledRef.current(),
  });
  const shelf = useShelf();
  const { loadShelfCount: loadSoundShelfCount, setShelfItems } = shelf;

  const catalog = useExtensionCatalog({
    onSoundShelfToggled: (enabled) => {
      if (enabled) {
        void shelf.loadShelfCount();
      } else {
        shelf.clearShelfState();
      }
    },
  });
  const { extensions } = catalog;

  const org = useLibraryOrganization({
    isCollectionSelected: (id) => selectedCollectionMirrorRef.current === id,
    onSelectedCollectionGone: () => {
      view.clearCollectionSelection();
    },
    onSelectedCollectionRestored: (id) => {
      view.restoreCollectionSelection(id);
    },
  });

  const filesApi = useLibraryFiles({
    libraryRoots: settingsScan.settings.libraryRoots,
    view: currentView,
    search: debouncedSearchQuery,
    collectionId: selectedCollection,
    tagId: selectedTagId,
    directory: selectedDirectory,
    getTags: () => org.tags,
    getSelectedFile: () => selectionApiRef.current.get(),
    syncSelectedFile: (updater) => selectionApiRef.current.sync(updater),
    onFilesRemoved: (removedIds, mode) => {
      transport.remove(removedIds);
      if (mode === "bulk") {
        selectionApiRef.current.clear();
      } else {
        selectionApiRef.current.removeIds(removedIds);
      }
      const selected = selectionApiRef.current.get();
      if (selected && removedIds.has(selected.id)) {
        selectionApiRef.current.sync(() => null);
        transport.setIsPlayerPlaying(false);
      }
    },
    onShelfItemsLoaded: setShelfItems,
  });
  const {
    files,
    orderedFiles,
    sortKey,
    sortDir,
    flipSort,
    directories,
    isLoadingFiles,
    hasMoreFiles,
    favoritesCount,
    loadFiles,
    loadMoreFiles,
    loadDirectories,
    toggleFavorite: handleToggleFavorite,
    toggleFileTag: handleToggleFileTag,
  } = filesApi;

  // ---- Selection: created after the file list so pruning sees the
  // current order. The data layer above delegates through selectionApiRef. ----
  const selection = useSelection({
    orderedFiles,
    playIds,
    togglePlayback: () => audioPlayerRef.current?.togglePlayback(),
  });
  const {
    selectedFile,
    selectedIds,
    selectedIdsRef,
    handleClearSelection,
    handleSelectFile,
    handleMoveSelection,
  } = selection;
  useEffect(() => {
    selectionApiRef.current = {
      get: selection.getSelectedFile,
      sync: selection.syncSelectedFile,
      clear: selection.handleClearSelection,
      removeIds: (removedIds) => selection.removeFromSelection(removedIds),
      focus: selection.focusFile,
    };
    navigateRef.current = selection.handleClearSelection;
  }, [selection]);

  // Initial mount only: full workspace load. Every mutation and the scan
  // settle path below refetch only their own slice, never the catalog, so a
  // collection rename costs one collections round-trip with no extension
  // re-registration. The shelf count resolves after the extension list, since
  // only an enabled sound-shelf reports items.
  const loadInitialData = useCallback(async () => {
    const [, loadedExtensions] = await Promise.all([
      settingsScan.loadSettingsScan(),
      catalog.loadExtensions(),
      org.loadOrganization(),
    ]);
    if (
      loadedExtensions?.some(
        (extension) => extension.id === "sound-shelf" && extension.enabled,
      )
    ) {
      void shelf.loadShelfCount();
    } else {
      shelf.clearShelfState();
    }
  }, [settingsScan, catalog, org, shelf]);

  // Targeted post-scan refetch driven by the per-mutation refetch map:
  // files plus collection counts, nothing else.
  const reloadAfterScan = useCallback(() => {
    const loaders: Partial<Record<RefetchSlice, () => Promise<unknown>>> = {
      files: loadFiles,
      collections: org.loadCollections,
    };
    return Promise.all(
      (SCAN_SETTLE_SLICES as RefetchSlice[]).map((slice) => {
        const load = loaders[slice];
        if (!load) {
          throw new Error(`No loader for refetch slice "${slice}"`);
        }
        return load();
      }),
    );
  }, [loadFiles, org.loadCollections]);
  useEffect(() => {
    scanSettledRef.current = reloadAfterScan;
  }, [reloadAfterScan]);

  // Collection navigation needs organization data at call time, so the
  // route composes the view hook with the organization slice here.
  const handleOpenCollection = useCallback(
    (collectionId: string) => {
      view.showCollection(collectionId, org.collections, org.loadSmartCount);
    },
    [view, org.collections, org.loadSmartCount],
  );

  // The extensions view also drops the player selection (no files listed).
  const handleShowExtensions = useCallback(() => {
    view.showExtensions();
    selection.setSelectedFile(null);
  }, [view, selection]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadInitialData();
    }, 0);

    return () => {
      window.clearTimeout(timer);
    };
  }, [loadInitialData]);

  const currentViewRef = useRef(currentView);
  useEffect(() => {
    currentViewRef.current = currentView;
  }, [currentView]);

  useEffect(() => {
    const handleSoundShelfChanged = () => {
      void loadSoundShelfCount();
      if (currentViewRef.current === "shelf") {
        void loadFiles();
      }
    };

    window.addEventListener(SOUND_SHELF_CHANGED_EVENT, handleSoundShelfChanged);
    return () => {
      window.removeEventListener(
        SOUND_SHELF_CHANGED_EVENT,
        handleSoundShelfChanged,
      );
    };
  }, [loadSoundShelfCount, loadFiles]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void Promise.all([loadFiles(), loadDirectories()]);
    }, 0);

    return () => {
      window.clearTimeout(timer);
    };
  }, [loadFiles, loadDirectories]);

  // ---- Remaining slices: bulk, extension UI, palette. Each takes
  // explicit callbacks; none writes another hook's state. ----
  const bulk = useBulkActions({
    getSelectedIds: () => selectedIdsRef.current,
    bulkFavorite: (ids) => filesApi.bulkFavorite(ids),
    bulkTag: (ids, tagId) => filesApi.bulkTag(ids, tagId),
    bulkRemove: (ids, choice) => filesApi.bulkRemove(ids, choice),
    addToShelf: (ids) => shelf.addToShelf(ids),
    enqueue,
    removeFile: (id, filename) => filesApi.removeFile(id, filename),
    reloadShelfCount: () => {
      void loadSoundShelfCount();
    },
  });
  const {
    confirmBulkRemove,
    setConfirmBulkRemove,
    handleBulkSaveAll,
    handleBulkAddToQueue,
    handleBulkAddToShelf,
    handleBulkTag,
    executeBulkRemove,
    handleRemoveFile: handleRemoveFileFromLibrary,
  } = bulk;

  const extUi = useExtensionUi({
    showShelf,
    enterLibraryView: () => view.enterView("all"),
    openSettings: settingsScan.openSettings,
    requestClearShelf: shelf.requestClearShelf,
    getSelectedFile: () => selectionApiRef.current.get(),
    addToCollection: (collectionId, fileId) =>
      org.addToCollection(collectionId, fileId),
    addToShelf: (ids) => shelf.addToShelf(ids),
    saveSearch: (name) => org.saveSearch(name, debouncedSearchQuery),
    renameCollection: (id, name) => org.renameCollection(id, name),
    extensions,
  });

  const palette = usePalette({
    extensions,
    orderedFiles,
    isPlaying: transport.isPlayerPlaying,
    autoplay: transport.autoplay,
    selectedFile,
    canStepQueue: transport.queueState.queue.length > 1,
    shelfEnabled: extensions.some(
      (extension) => extension.id === "sound-shelf" && extension.enabled,
    ),
    showLibrary,
    showFavorites,
    showShelf,
    showExtensions: handleShowExtensions,
    showOrganize,
    openSettings: settingsScan.openSettings,
    togglePlayback: () => audioPlayerRef.current?.togglePlayback(),
    stepNext: () =>
      transport.stepTo("next", {
        orderedFiles,
        files,
        focusFile: selection.focusFile,
      }),
    stepPrev: () =>
      transport.stepTo("prev", {
        orderedFiles,
        files,
        focusFile: selection.focusFile,
      }),
    toggleAutoplay: () => transport.setAutoplay(!transport.autoplay),
    toggleFavoriteCurrent: () => {
      const current = selectionApiRef.current.get();
      if (current) {
        void handleToggleFavorite(current.id);
      }
    },
    addCurrentToShelf: () => {
      void extUi.handleAddCurrentToShelf();
    },
    runCommand: extUi.handleRunCommand,
    playSound: (fileId) => {
      const match = orderedFiles.find((file) => file.id === fileId);
      if (match) {
        transport.playFile(orderedFiles, match);
        selection.focusFile(match);
      }
    },
    moveNext: () => handleMoveSelection(1),
    movePrev: () => handleMoveSelection(-1),
  });
  // Destructure palette locals so render only touches plain values; the
  // hook object itself carries input refs.
  const {
    paletteOpen,
    paletteQuery,
    paletteEntries,
    activePaletteIndex,
    paletteInputRef,
    searchInputRef,
    shortcutBindings,
    openPalette,
    closePalette,
    handlePaletteQueryChange,
    handlePaletteSelect,
    handleRebindShortcut,
    handleResetShortcuts,
    setPaletteIndex,
  } = palette;

  const selectedCollectionName = useMemo(() =>
    currentView === "collection"
      ? (org.collections.find((c) => c.id === selectedCollection)?.name ?? null)
      : null,
  [currentView, org.collections, selectedCollection]);

  const showExtensionsView = currentView === "extensions";
  const showShelfView = currentView === "shelf";
  const showOrganizeView = currentView === "organize";
  const hideHeaderActions = showExtensionsView || showShelfView || showOrganizeView;

  const railView = view.railView;

  const viewHeading =
    currentView === "favorites"
      ? "Favorites"
      : currentView === "extensions"
        ? "Tools"
        : currentView === "shelf"
          ? "Shelf"
          : currentView === "organize"
            ? "Organize"
            : currentView === "collection"
              ? (selectedCollectionName ?? "Library")
              : currentView === "directory"
                ? (selectedDirectory?.label ?? "Library")
                : "Library";

  const {
    soundShelfEnabled,
    makePackEnabled,
    folderJanitorEnabled,
    smartCollectionsEnabled,
    viewingSmartCollection,
    activeSmartCollectionId,
  } = useMemo(() => {
    const shelfEnabled = extensions.find((e) => e.id === "sound-shelf")?.enabled ?? false;
    const pack = extensions.find((e) => e.id === "make-pack")?.enabled ?? false;
    const janitor = extensions.find((e) => e.id === "folder-janitor")?.enabled ?? false;
    const smart = extensions.find((e) => e.id === "smart-collections")?.enabled ?? false;
    const activeSmart = selectedCollection
      ? org.collections.find((c) => c.id === selectedCollection && c.isSmart) ?? null
      : null;
    return {
      soundShelfEnabled: shelfEnabled,
      makePackEnabled: pack,
      folderJanitorEnabled: janitor,
      smartCollectionsEnabled: smart,
      viewingSmartCollection: activeSmart !== null,
      activeSmartCollectionId: activeSmart?.id ?? null,
    };
  }, [extensions, selectedCollection, org.collections]);

  const nextTitle = transport.nextTitleFor(files, selectedFile?.id);

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-canvas font-sans">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,color-mix(in_oklab,var(--accent-fill)_13%,transparent),transparent_38%),radial-gradient(circle_at_bottom_right,color-mix(in_oklab,var(--accent-fill)_6%,transparent),transparent_40%)]" />
      <div className="relative flex min-h-0 flex-1">

      <IconRail
        className="hidden md:flex"
        activeView={railView}
        favoritesCount={favoritesCount}
        shelfCount={shelf.soundShelfItemCount}
        onSelectLibrary={showLibrary}
        onSelectFavorites={showFavorites}
        onSelectShelf={showShelf}
        onSelectExtensions={handleShowExtensions}
        onSelectOrganize={showOrganize}
        onOpenSettings={settingsScan.openSettings}
        settingsActive={settingsScan.showSettings}
      />

      <Dialog open={view.showMobileSidebar} onOpenChange={(open) => { if (!open) view.closeMobileSidebar(); }}>
        <DialogContent
          showCloseButton={false}
          className="left-0 top-0 h-full w-auto translate-x-0 translate-y-0 rounded-none border-r border-white/10 bg-shell/95 p-2 shadow-2xl backdrop-blur-2xl duration-300 ease-out data-open:slide-in-from-left-8 data-open:fade-in-0 data-closed:slide-out-to-left-8 data-closed:fade-out-0"
        >
          <DialogTitle className="sr-only">Navigation Menu</DialogTitle>
          <IconRail
            activeView={railView}
            favoritesCount={favoritesCount}
            shelfCount={shelf.soundShelfItemCount}
            onSelectLibrary={() => {
              showLibrary();
              view.closeMobileSidebar();
            }}
            onSelectFavorites={() => {
              showFavorites();
              view.closeMobileSidebar();
            }}
            onSelectShelf={() => {
              showShelf();
              view.closeMobileSidebar();
            }}
            onSelectExtensions={() => {
              handleShowExtensions();
              view.closeMobileSidebar();
            }}
            onSelectOrganize={() => {
              showOrganize();
              view.closeMobileSidebar();
            }}
            onOpenSettings={() => {
              settingsScan.openSettings();
              view.closeMobileSidebar();
            }}
            settingsActive={settingsScan.showSettings}
          />
        </DialogContent>
      </Dialog>

      <main className="relative flex min-h-0 min-w-0 flex-1 flex-col bg-transparent">
        <DesktopTitleBar />

        <header className="shrink-0 px-4 pt-4 md:px-5">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              className="size-10 shrink-0 rounded-xl border-white/10 bg-white/5 duration-200 animate-in fade-in-0 zoom-in-95 hover:border-accent-fill/50 md:hidden"
              onClick={view.openMobileSidebar}
              aria-label="Open navigation menu"
            >
              <PanelLeft className="size-4" />
            </Button>

            {!hideHeaderActions && (
              <div className="flex flex-1 items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-4 transition-all focus-within:border-accent-fill/60 focus-within:bg-white/[0.06] focus-within:shadow-glow-accent">
                <Search className="size-4 shrink-0 text-zinc-500" />
                <input
                  ref={searchInputRef}
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search sounds by name, tag, or format..."
                  aria-label="Search sounds"
                  className="w-full bg-transparent py-2.5 text-[15px] font-medium text-zinc-50 placeholder:font-normal placeholder:text-zinc-600 focus:outline-none"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="shrink-0 rounded-md px-2 py-1 font-mono text-[11px] text-zinc-500 hover:text-zinc-100"
                  >
                    Clear
                  </button>
                )}
                <button
                  type="button"
                  onClick={openPalette}
                  aria-label="Open command palette"
                  title="Command palette (Ctrl+K)"
                  className="hidden shrink-0 items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 font-mono text-[11px] text-zinc-400 hover:border-accent-fill/50 hover:text-zinc-100 sm:flex"
                >
                  {"\u2318"}K{" "}
                  <span className="text-zinc-600">{files.length}</span>
                </button>
              </div>
            )}
            {smartCollectionsEnabled && searchQuery.trim() && (
              <>
                {viewingSmartCollection && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="hidden h-10 shrink-0 gap-2 rounded-xl border-white/10 bg-white/5 text-xs text-zinc-400 shadow-none backdrop-blur-none hover:border-accent-fill/50 hover:bg-white/[0.07] hover:text-zinc-100 sm:inline-flex"
                    onClick={() => {
                      if (activeSmartCollectionId) {
                        void org.updateCollectionFilter(
                          activeSmartCollectionId,
                          JSON.stringify({ q: searchQuery.trim() }),
                        );
                      }
                    }}
                  >
                    <Save className="size-4" />
                    Update Search
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="hidden h-10 shrink-0 gap-2 rounded-xl border-white/10 bg-white/5 text-xs text-zinc-400 shadow-none backdrop-blur-none hover:border-accent-fill/50 hover:bg-white/[0.07] hover:text-zinc-100 sm:inline-flex"
                  onClick={() => extUi.setShowSaveSearch(true)}
                >
                  <Save className="size-4" />
                  Save Search
                </Button>
              </>
            )}

          </div>
        </header>

        <div className="mt-4 mb-4 px-4 pt-4 md:px-5">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-2">
            <h1 className="text-5xl font-extrabold tracking-tighter text-zinc-50">
              {viewHeading}
            </h1>
            <span className="flex-1" />
            {showShelfView ? (
              <div className="flex flex-wrap items-center gap-2">
                {makePackEnabled && files.length > 0 ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9 gap-2 rounded-xl px-3 text-xs"
                    onClick={() => void extUi.handleMakePackShelf()}
                  >
                    <PackagePlus className="size-4" />
                    Pack Shelf
                  </Button>
                ) : null}
                {files.length > 0 ? (
                  shelf.confirmClearShelf ? (
                    <>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-9 gap-2 rounded-xl bg-destructive/15 px-3 text-xs font-semibold text-destructive transition-all hover:bg-destructive/25 active:scale-95"
                        onClick={() => {
                          shelf.cancelClearShelf();
                          void shelf.clearShelf();
                        }}
                      >
                        Sure?
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-9 gap-2 rounded-xl px-3 text-xs text-zinc-400"
                        onClick={() => shelf.cancelClearShelf()}
                        aria-label="Cancel clear shelf"
                      >
                        <X className="size-4" />
                      </Button>
                    </>
                  ) : (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-9 gap-2 rounded-xl px-3 text-xs text-zinc-400 hover:text-red-400"
                      onClick={() => shelf.requestClearShelf()}
                    >
                      <X className="size-4" />
                      Clear
                    </Button>
                  )
                ) : null}
              </div>
            ) : null}
          </div>
          {showExtensionsView || showShelfView || showOrganizeView ? (
            <p className="mt-1.5 text-sm font-medium text-zinc-400">
              {showExtensionsView
                ? "Optional workflows. Flip one on and it joins the workspace."
                : showOrganizeView
                  ? "Collections and tags in one place."
                  : "Sounds under review."}
            </p>
          ) : null}
        </div>

        {showExtensionsView ? (
          <ExtensionGrid
            extensions={extensions}
            isLoading={catalog.isLoadingExtensions}
            onOpenDetails={extUi.setSelectedExtension}
            onToggleEnabled={catalog.handleToggleExtensionEnabled}
            onRunCommand={extUi.handleRunCommand}
            pendingExtensionId={catalog.pendingExtensionId}
          />
        ) : showOrganizeView ? (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <OrganizeView
              collections={org.collections}
              tags={org.tags}
              selectedTagId={selectedTagId}
              smartCounts={org.smartCounts}
              onOpenCollection={handleOpenCollection}
              onRequestSmartCount={(id) => void org.loadSmartCount(id)}
              onCreateCollection={org.createCollection}
              onRenameCollection={org.renameCollection}
              onDeleteCollection={org.deleteCollection}
              onUpdateCollectionColor={org.updateCollectionColor}
              onCreateTag={org.createTag}
              onRenameTag={org.renameTag}
              onDeleteTag={org.deleteTag}
              onUpdateTagColor={org.updateTagColor}
              onSelectTag={handleFilterTag}
            />
          </div>
        ) : (
          <>
            {selectedIds.length > 1 ? (
              <div className="px-4 pt-3 md:px-5">
                <SelectionBulkBar
                  count={selectedIds.length}
                  tags={org.tags}
                  soundShelfEnabled={soundShelfEnabled}
                  onSaveAll={() => void handleBulkSaveAll()}
                  onAddToQueue={handleBulkAddToQueue}
                  onAddToShelf={() => void handleBulkAddToShelf()}
                    onTag={(tagId) => void handleBulkTag(tagId)}
                    onRemove={() => setConfirmBulkRemove({ stage: "choose" })}
                    bulkRemove={confirmBulkRemove}
                    removeDefault={settingsScan.removeDefault}
                    onChooseRemove={(choice) =>
                      setConfirmBulkRemove({ stage: "confirm", choice })
                    }
                    onConfirmRemove={() => void executeBulkRemove()}
                    onCancelRemove={() => setConfirmBulkRemove(null)}
                    onClear={handleClearSelection}
                  />
              </div>
            ) : null}
            <div className="flex min-h-0 flex-1">
              <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                <FileTable
                files={orderedFiles}
                directories={directories}
                currentDirectory={selectedDirectory}
                currentCollectionName={selectedCollectionName}
                onNavigate={navigateDirectory}
                onNavigateLibrary={showLibrary}
                selectedFileId={selectedFile?.id ?? null}
                selectedIds={selectedIds}
                isSelectedFilePlaying={transport.isPlayerPlaying}
                onSelect={handleSelectFile}
                onToggleFavorite={handleToggleFavorite}
                searchQuery={debouncedSearchQuery}
                isLoading={isLoadingFiles}
                hasMore={hasMoreFiles}
                onLoadMore={() => void loadMoreFiles()}
                showContainerBorder={currentView !== "favorites"}
                soundShelfEnabled={soundShelfEnabled}
                shelfFileIds={shelf.soundShelfFileIds}
                makePackEnabled={makePackEnabled}
                onMakePackFile={extUi.handleMakePackFile}
                onRemoveFile={handleRemoveFileFromLibrary}
                folderJanitorEnabled={folderJanitorEnabled}
                onScanFolder={extUi.handleScanFolder}
                allTags={org.tags}
                onToggleFileTag={handleToggleFileTag}
                sortKey={sortKey}
                sortDir={sortDir}
                onFlipSort={flipSort}
              />
              </div>
            </div>
          </>
        )}

      </main>
      </div>

      <AudioPlayer
        ref={audioPlayerRef}
        selectedFile={selectedFile}
        onClose={() =>
          transport.closePlayer({
            clearSelectedFile: () => selection.setSelectedFile(null),
            setPlaying: transport.setIsPlayerPlaying,
          })
        }
        onPlaybackChange={transport.setIsPlayerPlaying}
        onEnded={() =>
          transport.trackEnded({
            orderedFiles,
            files,
            focusFile: selection.focusFile,
          })
        }
        onNext={() =>
          transport.stepTo("next", {
            orderedFiles,
            files,
            focusFile: selection.focusFile,
          })
        }
        onPrev={() =>
          transport.stepTo("prev", {
            orderedFiles,
            files,
            focusFile: selection.focusFile,
          })
        }
        autoplay={transport.autoplay}
        onToggleAutoplay={transport.setAutoplay}
        nextTitle={nextTitle}
        onToggleFavorite={handleToggleFavorite}
        collections={org.collections}
        onAddToCollection={extUi.handleAddToCollection}
        onCreateCollection={settingsScan.openSettings}
      />

      <CommandPalette
        open={paletteOpen}
        query={paletteQuery}
        entries={paletteEntries}
        activeIndex={activePaletteIndex}
        inputRef={paletteInputRef}
        onQueryChange={handlePaletteQueryChange}
        onHoverEntry={setPaletteIndex}
        onSelectEntry={handlePaletteSelect}
        onClose={closePalette}
      />

      <SettingsDialog
        open={settingsScan.showSettings}
        onOpenChange={settingsScan.setShowSettings}
        settings={settingsScan.settings}
        onSaveRoot={settingsScan.handleSaveRoot}
        onRemoveRoot={settingsScan.handleRemoveRoot}
        scanStatus={settingsScan.scanStatus}
        onStartScan={settingsScan.handleStartScan}
        collections={org.collections}
        tags={org.tags}
        onCreateCollection={org.createCollection}
        onDeleteCollection={org.deleteCollection}
        onRenameCollection={(id, name) => extUi.openRenameCollection(id, name)}
        onConvertToRegularCollection={org.convertToRegularCollection}
        onCreateTag={org.createTag}
        onDeleteTag={org.deleteTag}
        extensions={extensions}
        onToggleExtension={catalog.handleToggleExtensionEnabled}
        onUpdateExtensionSetting={catalog.handleUpdateExtensionSetting}
        zoom={settingsScan.zoom}
        onUpdateZoom={settingsScan.handleUpdateZoom}
        shortcutBindings={shortcutBindings}
        onRebindShortcut={handleRebindShortcut}
        onResetShortcuts={handleResetShortcuts}
        removeDefault={settingsScan.removeDefault}
        onRemoveDefaultChange={settingsScan.handleRemoveDefaultChange}
      />

      <OnboardingDialog
        open={settingsScan.showOnboarding}
        onOpenChange={settingsScan.setShowOnboarding}
        onSaveRoot={settingsScan.saveLibraryRoot}
        onStartScan={settingsScan.startLibraryScan}
        onComplete={settingsScan.handleCompleteOnboarding}
      />

      <ExtensionDetailsDialog
        extension={extUi.selectedExtension}
        onOpenChange={extUi.handleCloseExtensionDetails}
        onRunCommand={extUi.handleRunCommand}
      />

      <FolderJanitorDialog
        open={extUi.folderJanitorOpen}
        onOpenChange={extUi.setFolderJanitorOpen}
        initialTarget={extUi.folderJanitorTarget}
        initialFolderPath={
          extUi.folderJanitorTarget === "folder" ? extUi.folderJanitorFolderPath : undefined
        }
      />

      <LibraryGathererDialog
        open={extUi.gatherOpen}
        onOpenChange={extUi.handleCloseGather}
      />

      <MakePackDialog
        open={extUi.packSource !== null}
        onOpenChange={extUi.handleClosePack}
        initialSource={extUi.packSource ?? "selection"}
        initialFileIds={extUi.packFileIds}
        initialOutputFormat={extUi.makePackDefaultFormat}
      />

      <SaveSearchDialog
        open={extUi.showSaveSearch}
        onOpenChange={extUi.setShowSaveSearch}
        onSave={(name) => {
          void extUi.submitSaveSearch(name);
        }}
      />

      <RenameCollectionDialog
        target={extUi.renamingCollection}
        onOpenChange={(open) => {
          if (!open) extUi.setRenamingCollection(null);
        }}
        onRename={(name) => {
          void extUi.submitRenameCollection(name);
        }}
      />
    </div>
  );
}
