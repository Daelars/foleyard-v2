// Foleyard's root workspace surface.
//
// The app rebuilt with the variant I component library: the same hooks,
// data, navigation, views, dialogs and workflows as the retired previous
// workspace, with route-local presentation adapters rendering the I
// treatment.
"use client";

import type { FileRecord } from "../library/types";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PackagePlus, PanelLeft, Save, Search, X } from "lucide-react";
import { toast } from "sonner";

import { V3AudioPlayer, type AudioPlayerRef } from "./components/player";
import { V3CommandPalette } from "./components/palette";
import { V3SelectionBulkBar } from "./components/bulk-bar";
import { V3LibraryDropZone } from "./components/extensions/drop-zone";
import { V3SelectionActions } from "./components/extensions/selection-actions";
import { V3ExtensionsSection } from "./components/extensions/settings-section";
import { V3ToolsCards } from "./components/extensions/tools-cards";
import { V3AutoTagBoard } from "./components/auto-tag/auto-tag";
import { useV2PaletteBridge } from "@/components/extensions-v2/use-v2-palette";
import { V3MakePackV2Dialog } from "./components/ext-flows/make-pack-v2";
import { MAKE_PACK_V2_ID, type MakePackV2Source } from "@/components/extensions/make-pack-v2/use-make-pack-v2";
import { AUTO_TAG_V2_FIND_SIMILAR, AUTO_TAG_V2_ID } from "@foleyard/auto-tag-v2";
import {
  FOLDER_JANITOR_V2_DELETE_FOLDERS,
  FOLDER_JANITOR_V2_ID,
  FOLDER_JANITOR_V2_SCAN_FOLDER,
  FOLDER_JANITOR_V2_SCAN_LIBRARY,
} from "@foleyard/folder-janitor-v2";
import { LIBRARY_GATHERER_V2_ID } from "@foleyard/library-gatherer-v2";
import { SMART_COLLECTIONS_V2_ID } from "@foleyard/smart-collections-v2";
import { SOUND_SHELF_V2_ID } from "@foleyard/sound-shelf-v2";
import {
  invokeV2Command,
  resolveV2UiPoint,
  useV2Catalog,
  type V2UiState,
} from "@/lib/extensions-v2/contributions";
import type { V2ResolvedContribution } from "@yard-core";
import { V3DesktopTitleBar } from "./components/title-bar";
import { V3ExtensionGrid } from "./components/extensions/extension-grid";
import { V3FolderJanitorDialog } from "./components/ext-flows/folder-janitor";
import { V3LibraryGathererDialog } from "./components/ext-flows/library-gatherer";
import { V3OnboardingDialog } from "./components/onboarding";
import { V3FileTable } from "./components/file-table/file-table";
import { V3OrganizeView } from "./components/organize";
import { V3SettingsDialog } from "./components/settings/settings-dialog";
import { V3IconRail } from "./components/rail";
import { Button, Dialog, DialogTitle, Kbd, VariantIProvider } from "@/components/variant-i";
import { SOUND_SHELF_CHANGED_EVENT } from "@/lib/extensions/sound-shelf-events";
import { useExtensionCatalog } from "../library/use-extension-catalog";
import { useLibraryFiles } from "../library/use-library-files";
import { useLibraryOrganization } from "../library/use-library-organization";
import { useLibraryView } from "../library/use-library-view";
import { useSelection } from "../library/use-selection";
import { useBulkActions } from "../library/use-bulk-actions";
import { useSettingsScan } from "../library/use-settings-scan";
import { useExtensionUi } from "../library/use-extension-ui";
import { useTransport } from "../library/use-transport";
import { usePalette } from "../library/use-palette";
import { useShelfV2 as useShelf } from "../library/use-shelf-v2";
import {
  V3ExtensionDetailsDialog,
  V3RenameCollectionDialog,
  V3SaveSearchDialog,
  V3SimilarSoundsDialog,
} from "./components/dialogs";
import { SCAN_SETTLE_SLICES, type RefetchSlice } from "../library/refetch-map";

export default function AppV3() {
  return <AppV3Content />;
}

function AppV3Content() {
  const audioPlayerRef = useRef<AudioPlayerRef>(null);

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
    tagOrigin,
    selectedDirectory,
    searchQuery,
    setSearchQuery,
    debouncedSearchQuery,
    showLibrary,
    showFavorites,
    showShelf,
    showOrganize,
    showAutoTag,
    autoTagPage,
    setAutoTagPage,
    handleFilterTag,
    handleFilterTagOrigin,
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
    tagOrigin,
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

  const { loadSettingsScan } = settingsScan;
  const { loadExtensions } = catalog;
  const { loadOrganization } = org;
  const { clearShelfState } = shelf;
  const loadInitialData = useCallback(async () => {
    const [, loadedExtensions] = await Promise.all([
      loadSettingsScan(),
      loadExtensions(),
      loadOrganization(),
    ]);
    if (
      loadedExtensions?.some(
        (extension) => extension.id === "sound-shelf" && extension.enabled,
      )
    ) {
      void loadSoundShelfCount();
    } else {
      clearShelfState();
    }
  }, [loadSettingsScan, loadExtensions, loadOrganization, loadSoundShelfCount, clearShelfState]);

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

  const handleOpenCollection = useCallback(
    (collectionId: string) => {
      view.showCollection(collectionId, org.collections, org.loadSmartCount);
    },
    [view, org.collections, org.loadSmartCount],
  );

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
    openSettings: settingsScan.openSettings,
    requestClearShelf: shelf.requestClearShelf,
    getSelectedFile: () => selectionApiRef.current.get(),
    addToCollection: (collectionId, fileId) =>
      org.addToCollection(collectionId, fileId),
    addToShelf: (ids) => shelf.addToShelf(ids),
    saveSearch: (name) => org.saveSearch(name, debouncedSearchQuery),
    renameCollection: (id, name) => org.renameCollection(id, name),
  });

  const v2Catalog = useV2Catalog();
  const [packV2, setPackV2] = useState<{ source: MakePackV2Source; fileIds: string[] } | null>(null);
  const [similarV2, setSimilarV2] = useState<null | {
    source: string;
    state: "unavailable" | "empty" | "ready";
    matches: Array<{ fileId: string; filename: string; score: number }>;
  }>(null);
  const v2UiState: V2UiState = useMemo(
    () => ({
      enabled: new Set(v2Catalog.extensions.filter((entry) => entry.enabled).map((entry) => entry.id)),
      capabilities: {},
    }),
    [v2Catalog.extensions],
  );

  const v2Palette = useV2PaletteBridge(selectedIds, v2Catalog.catalog, v2UiState, {
    onOpenJanitor: extUi.openJanitorLibrary,
    onOpenGather: extUi.openGatherDialog,
  });
  const makePackV2Enabled = useMemo(
    () => v2Catalog.extensions.some((entry) => entry.id === MAKE_PACK_V2_ID && entry.enabled),
    [v2Catalog.extensions],
  );
  const autoTagEnabled = useMemo(
    () => v2Catalog.extensions.some((entry) => entry.id === AUTO_TAG_V2_ID && entry.enabled),
    [v2Catalog.extensions],
  );
  const openPackV2 = useCallback((source: MakePackV2Source, fileIds: string[]) => {
    setPackV2({ source, fileIds });
  }, []);
  // Tools-grid run dispatch: every card opens its dialog or view per the
  // package README. Drop Rules v2 has no run action (drop zone +
  // settings surface instead).
  const runV2Extension = useCallback((extensionId: string) => {
    if (extensionId === MAKE_PACK_V2_ID) {
      openPackV2("recent", []);
      return;
    }
    if (extensionId === SOUND_SHELF_V2_ID) {
      showShelf();
      return;
    }
    if (extensionId === SMART_COLLECTIONS_V2_ID) {
      extUi.setShowSaveSearch(true);
      return;
    }
    if (extensionId === FOLDER_JANITOR_V2_ID) {
      extUi.openJanitorLibrary();
      return;
    }
    if (extensionId === LIBRARY_GATHERER_V2_ID) {
      extUi.openGatherDialog();
      return;
    }
    if (extensionId === AUTO_TAG_V2_ID) {
      showAutoTag();
    }
  }, [openPackV2, showShelf, showAutoTag, extUi.setShowSaveSearch, extUi.openJanitorLibrary, extUi.openGatherDialog]);
  const invokeV2RowCommand = useCallback(
    (item: V2ResolvedContribution, fileIds: string[]) => {
      if (item.extensionId === MAKE_PACK_V2_ID) {
        openPackV2("selection", fileIds);
        return;
      }
      // Dialog-owned tools: scans and deletes need the janitor report UI
      // and gather needs the grant-orchestrating dialog; invoking them
      // headless strands review plans with nowhere to confirm. Index
      // removals stay headless (immediate, toast-confirmed below).
      if (
        item.extensionId === FOLDER_JANITOR_V2_ID &&
        (item.commandId === FOLDER_JANITOR_V2_SCAN_LIBRARY ||
          item.commandId === FOLDER_JANITOR_V2_SCAN_FOLDER ||
          item.commandId === FOLDER_JANITOR_V2_DELETE_FOLDERS)
      ) {
        extUi.openJanitorLibrary();
        return;
      }
      if (item.extensionId === LIBRARY_GATHERER_V2_ID) {
        extUi.openGatherDialog();
        return;
      }
      void invokeV2Command({
        extensionId: item.extensionId,
        commandId: item.commandId,
        fileIds,
      }).then((result) => {
        if (!result.ok) {
          toast.error(result.message);
          return;
        }
        const body = result.body as { ok?: boolean; error?: { message?: string } };
        if (!body?.ok) {
          toast.error(body?.error?.message ?? "Extension command failed.");
          return;
        }
        if (item.extensionId === AUTO_TAG_V2_ID && item.commandId === AUTO_TAG_V2_FIND_SIMILAR) {
          const outcome = (result.body as { outcome?: { kind?: string; value?: Record<string, unknown> } }).outcome;
          const value = outcome?.kind === "immediate" ? outcome.value : undefined;
          const matches = Array.isArray(value?.matches)
            ? value.matches.flatMap((entry) => {
                if (typeof entry !== "string") return [];
                try { return [JSON.parse(entry) as { fileId: string; filename: string; score: number }]; }
                catch { return []; }
              })
            : [];
          setSimilarV2({
            source: typeof value?.targetFilename === "string" ? value.targetFilename : "Selected sound",
            state: value?.unavailable === true ? "unavailable" : matches.length ? "ready" : "empty",
            matches,
          });
          return;
        }
        toast.success("Extension command completed.");
      });
    },
    [openPackV2, extUi.openJanitorLibrary, extUi.openGatherDialog],
  );
  const resolveV2FileItems = useCallback(
    (fileId: string) =>
      resolveV2UiPoint(v2Catalog.catalog, "context-menu", { fileIds: [fileId] }, v2UiState),
    [v2Catalog.catalog, v2UiState],
  );
  const bulkV2Items = useMemo(
    () =>
      selectedIds.length > 0
        ? resolveV2UiPoint(v2Catalog.catalog, "selection-actions", { fileIds: selectedIds }, v2UiState)
        : [],
    [v2Catalog.catalog, selectedIds, v2UiState],
  );

  const palette = usePalette({
    extensions,
    orderedFiles,
    v2ToolCommands: v2Palette.v2ToolCommands,
    runV2Command: v2Palette.runV2Command,
    isPlaying: transport.isPlayerPlaying,
    autoplay: transport.autoplay,
    selectedFile,
    canStepQueue: transport.queueState.queue.length > 1,
    shelfEnabled: extensions.some(
      (extension) => extension.id === "sound-shelf" && extension.enabled,
    ),
    autoTagEnabled,
    showLibrary,
    showFavorites,
    showShelf,
    showExtensions: handleShowExtensions,
    showOrganize,
    showAutoTag,
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
  const showAutoTagView = currentView === "auto-tag";
  const hideHeaderActions = showExtensionsView || showShelfView || showOrganizeView || showAutoTagView;

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
            : currentView === "auto-tag"
              ? "Auto tag"
            : currentView === "collection"
              ? (selectedCollectionName ?? "Library")
              : currentView === "directory"
                ? (selectedDirectory?.label ?? "Library")
                : "Library";

  const {
    soundShelfEnabled,
    folderJanitorEnabled,
    smartCollectionsEnabled,
    viewingSmartCollection,
    activeSmartCollectionId,
  } = useMemo(() => {
    const shelfEnabled = extensions.find((e) => e.id === "sound-shelf")?.enabled ?? false;
    const janitor = extensions.find((e) => e.id === "folder-janitor")?.enabled ?? false;
    const smart = v2Catalog.extensions.find((e) => e.id === "smart-collections-v2")?.enabled ?? false;
    const activeSmart = selectedCollection
      ? org.collections.find((c) => c.id === selectedCollection && c.isSmart) ?? null
      : null;
    return {
      soundShelfEnabled: shelfEnabled,
      folderJanitorEnabled: janitor,
      smartCollectionsEnabled: smart,
      viewingSmartCollection: activeSmart !== null,
      activeSmartCollectionId: activeSmart?.id ?? null,
    };
  }, [extensions, v2Catalog.extensions, selectedCollection, org.collections]);

  const nextTitle = transport.nextTitleFor(files, selectedFile?.id);

  return (
    <VariantIProvider className="relative flex h-full flex-col overflow-hidden bg-canvas font-sans">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,color-mix(in_oklab,var(--accent-fill)_13%,transparent),transparent_38%),radial-gradient(circle_at_bottom_right,color-mix(in_oklab,var(--accent-fill)_6%,transparent),transparent_40%)]" />
      <div className="relative flex min-h-0 flex-1">

      <V3IconRail
        className="hidden md:flex"
        activeView={railView}
        favoritesCount={favoritesCount}
        shelfCount={shelf.soundShelfItemCount}
        onSelectLibrary={showLibrary}
        onSelectFavorites={showFavorites}
        onSelectShelf={showShelf}
        onSelectExtensions={handleShowExtensions}
        onSelectOrganize={showOrganize}
        showAutoTag={autoTagEnabled}
        onSelectAutoTag={showAutoTag}
        onOpenSettings={settingsScan.openSettings}
        settingsActive={settingsScan.showSettings}
      />

      <Dialog
        open={view.showMobileSidebar}
        onClose={() => view.closeMobileSidebar()}
        labelledBy="app-v3-mobile-nav-title"
        maxWidth="w-auto"
      >
        <div className="w-full max-w-[200px]">
          <DialogTitle id="app-v3-mobile-nav-title" >
            <span className="sr-only">Navigation Menu</span>
          </DialogTitle>
          <V3IconRail
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
            showAutoTag={autoTagEnabled}
            onSelectAutoTag={() => {
              showAutoTag();
              view.closeMobileSidebar();
            }}
            onOpenSettings={() => {
              settingsScan.openSettings();
              view.closeMobileSidebar();
            }}
            settingsActive={settingsScan.showSettings}
          />
        </div>
      </Dialog>

      <main className="relative flex min-h-0 min-w-0 flex-1 flex-col bg-transparent">
        <V3DesktopTitleBar />

        <header className="shrink-0 px-4 pt-4 md:px-5">
          <div className="flex items-center gap-3">
            <Button
              tone="secondary"
              size="icon"
              className="size-10 shrink-0 rounded-xl md:hidden"
              onClick={view.openMobileSidebar}
              aria-label="Open navigation menu"
            >
              <PanelLeft className="size-4" />
            </Button>

            {!hideHeaderActions && (
              <div className="relative flex flex-1 items-center">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-500" />
                <input
                  ref={searchInputRef}
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search sounds by name, tag, or format…"
                  aria-label="Search sounds"
                  className="h-10 w-full min-w-0 rounded-lg border border-[var(--vi-edge)] bg-[var(--vi-well)] pl-9 pr-36 text-[13px] text-zinc-100 shadow-[var(--vi-sink)] outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-zinc-600 hover:border-[var(--vi-edge-hi)] focus:border-[color-mix(in_oklab,var(--accent-fill)_60%,transparent)] focus:shadow-[var(--vi-sink),0_0_16px_color-mix(in_oklab,var(--accent-fill)_10%,transparent)] motion-reduce:transition-none"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="absolute right-24 top-1/2 -translate-y-1/2 shrink-0 rounded-md px-2 py-1 font-mono text-[11px] text-zinc-500 hover:text-zinc-100"
                  >
                    Clear
                  </button>
                )}
                <button
                  type="button"
                  onClick={openPalette}
                  aria-label="Open command palette"
                  title="Command palette (Ctrl+K)"
                  className="absolute right-2.5 top-1/2 hidden -translate-y-1/2 shrink-0 items-center gap-1.5 rounded-md border border-[var(--vi-edge-hi)] bg-[linear-gradient(180deg,rgba(255,255,255,0.07),rgba(255,255,255,0.02))] px-1.5 py-0.5 font-mono text-[10px] text-zinc-400 shadow-[var(--vi-lift)] sm:flex"
                >
                  <Kbd>⌘</Kbd>
                  <Kbd>K</Kbd>
                  <span className="ml-1 text-zinc-600">{files.length}</span>
                </button>
              </div>
            )}
            {smartCollectionsEnabled && searchQuery.trim() && (
              <>
                {viewingSmartCollection && (
                  <Button
                    tone="secondary"
                    size="sm"
                    className="hidden h-10 shrink-0 gap-2 rounded-xl sm:inline-flex"
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
                  tone="secondary"
                  size="sm"
                  className="hidden h-10 shrink-0 gap-2 rounded-xl sm:inline-flex"
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
            {!showExtensionsView && !showShelfView && !showOrganizeView && !showAutoTagView ? (
              <div
                className="flex items-center gap-1"
                role="group"
                aria-label="Filter by tag origin"
              >
                {(
                  [
                    { value: null, label: "All" },
                    { value: "manual", label: "Manual" },
                    { value: "deterministic", label: "Rules" },
                    { value: "semantic_ai", label: "AI" },
                  ] as const
                ).map((option) => (
                  <button
                    key={option.label}
                    type="button"
                    onClick={() => handleFilterTagOrigin(option.value)}
                    aria-pressed={tagOrigin === option.value}
                    className={
                      tagOrigin === option.value
                        ? "rounded-md bg-[color-mix(in_oklab,var(--accent-fill)_15%,transparent)] px-2 py-1 font-mono text-[11px] font-bold text-accent-text"
                        : "rounded-md px-2 py-1 font-mono text-[11px] text-zinc-500 hover:bg-white/[0.06] hover:text-zinc-100"
                    }
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            ) : null}
            {showShelfView ? (
              <div className="flex flex-wrap items-center gap-2">
                {makePackV2Enabled && files.length > 0 ? (
                  <Button
                    type="button"
                    tone="secondary"
                    size="sm"
                    className="h-9 gap-2 rounded-xl px-3"
                    onClick={() => openPackV2("shelf", [])}
                  >
                    <PackagePlus className="size-4" />
                    Pack Shelf v2
                  </Button>
                ) : null}
                {files.length > 0 ? (
                  shelf.confirmClearShelf ? (
                    <>
                      <Button
                        type="button"
                        tone="danger"
                        size="sm"
                        className="h-9 gap-2 rounded-xl px-3"
                        onClick={() => {
                          shelf.cancelClearShelf();
                          void shelf.clearShelf();
                        }}
                      >
                        Sure?
                      </Button>
                      <Button
                        type="button"
                        tone="ghost"
                        size="sm"
                        className="h-9 gap-2 rounded-xl px-3"
                        onClick={() => shelf.cancelClearShelf()}
                        aria-label="Cancel clear shelf"
                      >
                        <X className="size-4" />
                      </Button>
                    </>
                  ) : (
                    <Button
                      type="button"
                      tone="ghost"
                      size="sm"
                      className="h-9 gap-2 rounded-xl px-3"
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
          {showExtensionsView || showShelfView || showOrganizeView || showAutoTagView ? (
            <p className="mt-1.5 text-sm font-medium text-zinc-400">
              {showExtensionsView
                ? "Optional workflows. Flip one on and it joins the workspace."
                : showOrganizeView
                  ? "Collections and tags in one place."
                  : showAutoTagView
                    ? "Automatic tagging coverage, candidates, and similar sounds."
                    : "Sounds under review."}
            </p>
          ) : null}
        </div>

        {showExtensionsView ? (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <V3ExtensionGrid
              extensions={extensions}
              isLoading={catalog.isLoadingExtensions}
              onOpenDetails={extUi.setSelectedExtension}
              onToggleEnabled={catalog.handleToggleExtensionEnabled}
              onRunCommand={extUi.handleRunCommand}
              pendingExtensionId={catalog.pendingExtensionId}
                trailing={
                 <V3ToolsCards
                    onRunExtension={runV2Extension}
                    onEnabledToggle={() => v2Catalog.refresh()}
                  />
                }
                trailingCount={v2Catalog.extensions.length}
              />
            </div>
        ) : showOrganizeView ? (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <V3OrganizeView
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
        ) : showAutoTagView ? (
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 md:px-5">
            <V3AutoTagBoard
              enabled={autoTagEnabled}
              page={autoTagPage}
              onPageChange={setAutoTagPage}
              onOpenExtensionControls={view.showExtensions}
            />
          </div>
        ) : (
          <>
            {selectedIds.length > 1 ? (
              <div className="px-4 pt-3 md:px-5">
                <V3SelectionBulkBar
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
                    v2Actions={
                      <>
                        {bulkV2Items.length > 0 ? (
                          <V3SelectionActions
                            items={bulkV2Items}
                            selectionCount={selectedIds.length}
                            onInvoke={(item) => invokeV2RowCommand(item, selectedIds)}
                          />
                        ) : null}
                        {makePackV2Enabled ? (
                          <Button
                            type="button"
                            tone="secondary"
                            size="sm"
                            className="gap-1.5"
                            onClick={() => openPackV2("selection", selectedIds)}
                          >
                            <PackagePlus className="size-3.5" />
                            Pack v2…
                          </Button>
                        ) : null}
                      </>
                    }
                  />
              </div>
            ) : null}
            <div className="flex min-h-0 flex-1">
              <V3LibraryDropZone catalog={v2Catalog.catalog} uiState={v2UiState}>
              <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                <V3FileTable
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
                resolveV2FileItems={resolveV2FileItems}
                onV2Command={(item, file) =>
                  invokeV2RowCommand(
                    item,
                    selectedIds.includes(file.id) && selectedIds.length > 0 ? selectedIds : [file.id],
                  )
                }
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
              </V3LibraryDropZone>
            </div>
          </>
        )}

      </main>
      </div>

      <V3AudioPlayer
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

      <V3CommandPalette
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

      <V3SettingsDialog
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
        v2Settings={<V3ExtensionsSection onEnabledToggle={() => v2Catalog.refresh()} />}
        zoom={settingsScan.zoom}
        onUpdateZoom={settingsScan.handleUpdateZoom}
        shortcutBindings={shortcutBindings}
        onRebindShortcut={handleRebindShortcut}
        onResetShortcuts={handleResetShortcuts}
        removeDefault={settingsScan.removeDefault}
        onRemoveDefaultChange={settingsScan.handleRemoveDefaultChange}
      />

      <V3OnboardingDialog
        open={settingsScan.showOnboarding}
        onOpenChange={settingsScan.setShowOnboarding}
        onSaveRoot={settingsScan.saveLibraryRoot}
        onStartScan={settingsScan.startLibraryScan}
        onComplete={settingsScan.handleCompleteOnboarding}
      />

      <V3ExtensionDetailsDialog
        extension={extUi.selectedExtension}
        onOpenChange={extUi.handleCloseExtensionDetails}
        onRunCommand={extUi.handleRunCommand}
      />

      <V3FolderJanitorDialog
        open={extUi.folderJanitorOpen}
        onOpenChange={extUi.setFolderJanitorOpen}
        initialTarget={extUi.folderJanitorTarget}
        initialFolderPath={
          extUi.folderJanitorTarget === "folder" ? extUi.folderJanitorFolderPath : undefined
        }
      />

      <V3LibraryGathererDialog
        open={extUi.gatherOpen}
        onOpenChange={extUi.handleCloseGather}
      />


      <V3MakePackV2Dialog
        open={packV2 !== null}
        onOpenChange={(open) => {
          if (!open) setPackV2(null);
        }}
        initialSource={packV2?.source ?? "selection"}
        initialFileIds={packV2?.fileIds ?? []}
      />

      <V3SimilarSoundsDialog
        open={similarV2 !== null}
        onOpenChange={(open) => { if (!open) setSimilarV2(null); }}
        state={similarV2}
      />

      <V3SaveSearchDialog
        open={extUi.showSaveSearch}
        onOpenChange={extUi.setShowSaveSearch}
        onSave={(name) => {
          void extUi.submitSaveSearch(name);
        }}
      />

      <V3RenameCollectionDialog
        target={extUi.renamingCollection}
        onOpenChange={(open) => {
          if (!open) extUi.setRenamingCollection(null);
        }}
        onRename={(name) => {
          void extUi.submitRenameCollection(name);
        }}
      />
    </VariantIProvider>
  );
}