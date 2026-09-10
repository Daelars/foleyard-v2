"use client";

import type { FileRecord } from "@/app/library/types";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PackagePlus, PanelLeft, Save, Search, X } from "lucide-react";
import { toast } from "sonner";

import { AudioPlayer, type AudioPlayerRef } from "@/components/workspace/AudioPlayer";
import { CommandPalette } from "@/components/workspace/CommandPalette/CommandPalette";
import { SelectionBulkBar } from "@/components/workspace/FileTable/bulk-bar";
import { V2LibraryDropZone } from "@/components/workspace/extensions-v2/drop-zone";
import { V2SelectionActions } from "@/components/workspace/extensions-v2/menus";
import { V2ExtensionsSection } from "@/components/workspace/extensions-v2/settings-section";
import { V2ToolsCards } from "@/components/workspace/extensions-v2/tools-cards";
import { AutoTagBoard } from "@/components/workspace/AutoTagBoard/board";
import { useV2PaletteBridge } from "@/components/extensions-v2/use-v2-palette";
import { MakePackV2Dialog } from "@/components/workspace/extensions/make-pack-v2/MakePackV2Dialog";
import { LibraryGathererV2Dialog } from "@/components/extensions/library-gatherer-v2/LibraryGathererV2Dialog";
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
import { DesktopTitleBar } from "@/components/workspace/DesktopTitleBar";
import { ExtensionGrid } from "@/components/workspace/ExtensionGrid";
import { FolderJanitorV2Dialog } from "@/components/workspace/extensions/folder-janitor-v2/FolderJanitorV2Dialog";
import { OnboardingDialog } from "@/components/workspace/OnboardingDialog";
import { FileTable } from "@/components/workspace/FileTable";
import { OrganizeView } from "@/components/workspace/OrganizeView";
import { SettingsDialog } from "@/components/workspace/settings/SettingsDialog";
import { IconRail } from "@/components/workspace/IconRail";
import { Button } from "@/components/kit/button";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogTitle } from "@/components/kit/dialog";
import { SOUND_SHELF_CHANGED_EVENT } from "@/lib/extensions/sound-shelf-events";
import { useExtensionCatalog } from "@/app/library/use-extension-catalog";
import { useLibraryFiles } from "@/app/library/use-library-files";
import { useLibraryOrganization } from "@/app/library/use-library-organization";
import { useLibraryView } from "@/app/library/use-library-view";
import { useSelection } from "@/app/library/use-selection";
import { useBulkActions } from "@/app/library/use-bulk-actions";
import { useSettingsScan } from "@/app/library/use-settings-scan";
import { useExtensionUi } from "@/app/library/use-extension-ui";
import { useTransport } from "@/app/library/use-transport";
import { usePalette } from "@/app/library/use-palette";
import { useShelfV2 } from "@/app/library/use-shelf-v2";
import {
  ExtensionDetailsDialog,
  RenameCollectionDialog,
  SaveSearchDialog,
} from "@/app/workspace/dialogs";
import { SCAN_SETTLE_SLICES, type RefetchSlice } from "@/app/library/refetch-map";

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
  const shelf = useShelfV2();
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
  // re-registration. The shelf count resolves through the v2 engine, which
  // fails closed (clears local state) when sound-shelf-v2 is disabled.
  const { loadSettingsScan } = settingsScan;
  const { loadExtensions } = catalog;
  const { loadOrganization } = org;
  // Hook result objects change on every render. Depend on their stable
  // loaders so startup responses cannot schedule another workspace load.
  const loadInitialData = useCallback(async () => {
    await Promise.all([
      loadSettingsScan(),
      loadExtensions(),
      loadOrganization(),
    ]);
    void loadSoundShelfCount();
  }, [loadSettingsScan, loadExtensions, loadOrganization, loadSoundShelfCount]);

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
    openSettings: settingsScan.openSettings,
    requestClearShelf: shelf.requestClearShelf,
    getSelectedFile: () => selectionApiRef.current.get(),
    addToCollection: (collectionId, fileId) =>
      org.addToCollection(collectionId, fileId),
    addToShelf: (ids) => shelf.addToShelf(ids),
    saveSearch: (name) => org.saveSearch(name, debouncedSearchQuery),
    renameCollection: (id, name) => org.renameCollection(id, name),
  });

  // v2 entry points (R8): live catalog for row/bulk/settings adapters plus
  // the Make Pack v2 dialog. Renderer-owned routing: Make Pack v2 commands
  // open its dialog (preview → destination → job); every other v2 command
  // invokes through the single execution path with a toast outcome.
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

  // v2 palette bridge (R6): resolved palette-point contributions for the
  // current selection over the shared catalog snapshot — selection
  // changes re-resolve locally with no refetch; v1 entries and
  // shortcuts keep working untouched.
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
    runV2Command: v2Palette.runV2Command,    isPlaying: transport.isPlayerPlaying,
    autoplay: transport.autoplay,
    selectedFile,
    canStepQueue: transport.queueState.queue.length > 1,
    shelfEnabled: v2Catalog.extensions.some(
      (extension) => extension.id === "sound-shelf-v2" && extension.enabled,
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
    // Sound Shelf and Folder Janitor retired from v1: their v2 ports own them now.
    const shelfEnabled = v2Catalog.extensions.find((e) => e.id === "sound-shelf-v2")?.enabled ?? false;
    const janitor = v2Catalog.extensions.find((e) => e.id === "folder-janitor-v2")?.enabled ?? false;
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
  }, [v2Catalog.extensions, selectedCollection, org.collections]);

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
        showAutoTag={autoTagEnabled}
        onSelectAutoTag={showAutoTag}
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
            {!showExtensionsView && !showShelfView && !showOrganizeView && !showAutoTagView ? (
              <div
                className="relative inline-flex h-9 items-center gap-0.5 rounded-lg border border-edge bg-mat-inset p-1 shadow-elev-well"
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
                    className={cn(
                      "flex h-7 items-center rounded-md border px-2.5 font-mono text-[11px] outline-none",
                      "transition-[background-color,border-color,box-shadow,color] duration-150 motion-reduce:transition-none",
                      "focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-1 focus-visible:ring-offset-canvas",
                      tagOrigin === option.value
                        ? "border-edge-accent-soft bg-[color-mix(in_oklab,var(--accent-fill)_12%,transparent)] text-accent-text shadow-[0_0_14px_color-mix(in_oklab,var(--accent-fill)_10%,transparent),inset_0_1px_0_rgba(255,255,255,0.07)]"
                        : "border-transparent text-zinc-500 hover:text-zinc-200",
                    )}
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
                    variant="outline"
                    size="sm"
                    className="h-9 gap-2 rounded-xl px-3 text-xs"
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
            <ExtensionGrid
              extensions={extensions}
              isLoading={catalog.isLoadingExtensions}
              onOpenDetails={extUi.setSelectedExtension}
              onToggleEnabled={catalog.handleToggleExtensionEnabled}
              onRunCommand={extUi.handleRunCommand}
              pendingExtensionId={catalog.pendingExtensionId}
              trailing={<V2ToolsCards onRunExtension={runV2Extension} />}
              trailingCount={v2Catalog.extensions.length}
              />
            </div>
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
        ) : showAutoTagView ? (
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 md:px-5">
            <AutoTagBoard
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
                    v2Actions={
                      <>
                        {bulkV2Items.length > 0 ? (
                          <V2SelectionActions
                            items={bulkV2Items}
                            selectionCount={selectedIds.length}
                            onInvoke={(item) => invokeV2RowCommand(item, selectedIds)}
                          />
                        ) : null}
                        {makePackV2Enabled ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="xs"
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
              <V2LibraryDropZone catalog={v2Catalog.catalog} uiState={v2UiState}>
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
              </V2LibraryDropZone>
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
        v2Settings={<V2ExtensionsSection />}
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

      <FolderJanitorV2Dialog
        open={extUi.folderJanitorOpen}
        onOpenChange={extUi.setFolderJanitorOpen}
        initialTarget={extUi.folderJanitorTarget}
        initialFolderPath={
          extUi.folderJanitorTarget === "folder" ? extUi.folderJanitorFolderPath : undefined
        }
      />

      <LibraryGathererV2Dialog
        open={extUi.gatherOpen}
        onOpenChange={extUi.handleCloseGather}
      />

      <MakePackV2Dialog
        open={packV2 !== null}
        onOpenChange={(open) => {
          if (!open) setPackV2(null);
        }}
        initialSource={packV2?.source ?? "selection"}
        initialFileIds={packV2?.fileIds ?? []}
      />

      <Dialog open={similarV2 !== null} onOpenChange={(open) => { if (!open) setSimilarV2(null); }}>
        <DialogContent>
          <DialogTitle>Similar sounds</DialogTitle>
          <p className="truncate text-xs text-muted-foreground">Compared with {similarV2?.source}</p>
          {similarV2?.state === "unavailable" && <p>Similarity unavailable until audio analysis completes.</p>}
          {similarV2?.state === "empty" && <p>Analysis is available, but no similar files met the threshold.</p>}
          {similarV2?.state === "ready" && <ul className="divide-y divide-border">{similarV2.matches.map((match) => <li key={match.fileId} className="flex gap-3 py-2"><span className="min-w-0 flex-1 truncate">{match.filename}</span><span className="font-mono text-muted-foreground">{Math.round(match.score * 100)}%</span></li>)}</ul>}
        </DialogContent>
      </Dialog>

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
