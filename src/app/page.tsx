"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, PackagePlus, PanelLeft, Save, Search, X } from "lucide-react";
import { toast } from "sonner";

import { AudioPlayer, type AudioPlayerRef } from "@/components/AudioPlayer";
import { useTransportQueue } from "@/components/AudioPlayer/use-transport-queue";
import {
  buildPaletteEntries,
  type PaletteEntry,
} from "@/components/CommandPalette/command-palette";
import { CommandPalette } from "@/components/CommandPalette/CommandPalette";
import {
  DEFAULT_SHORTCUTS,
  isTypingTarget,
  loadRemoveDefault,
  loadShortcutBindings,
  matchShortcutKey,
  persistRemoveDefault,
  persistShortcutBindings,
  shouldSkipSpace,
  type RemoveDefault,
  type ShortcutAction,
  type ShortcutBindings,
} from "@/components/Shortcuts/shortcuts";
import { SelectionBulkBar } from "@/components/FileTable/bulk-bar";
import {
  clearSelection,
  rangeSelect,
  toggleInSelection,
} from "@/components/FileTable/selection";
import type { SelectModifiers } from "@/components/FileTable/types";
import { DesktopTitleBar } from "@/components/DesktopTitleBar";
import { ExtensionGrid, type ExtensionGridItem } from "@/components/ExtensionGrid";
import { FolderJanitorDialog } from "@/components/extensions/folder-janitor/FolderJanitorDialog";
import { LibraryGathererDialog } from "@/components/extensions/library-gatherer/LibraryGathererDialog";
import { MakePackDialog } from "@/components/extensions/make-pack/MakePackDialog";
import { OnboardingDialog } from "@/components/OnboardingDialog";
import { RenameHammerDialog } from "@/components/extensions/rename-hammer/RenameHammerDialog";
import { FileTable } from "@/components/FileTable";
import { SettingsDialog } from "@/components/SettingsDialog";
import { IconRail, type RailView } from "@/components/IconRail";
import { AudioPlayerProvider } from "@/components/ui/audio-player";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { SOUND_SHELF_CHANGED_EVENT } from "@/lib/extensions/sound-shelf-events";
import { interpretExtensionUiIntent } from "@/lib/extensions/ui-intent";
import { isDesktopApp } from "@/lib/desktop";
import { useZoom } from "@/hooks/use-zoom";
import { useScanPolling } from "@/hooks/use-scan-polling";
import type { YardExtensionHostOutcome } from "@yard-core";

interface FileRecord {
  id: string;
  filename: string;
  path: string;
  directory: string | null;
  format: string | null;
  duration: number | null;
  fileSize: number | null;
  isFavorite: boolean;
  tags: { id: string; name: string }[];
}

interface CollectionRecord {
  id: string;
  name: string;
  fileCount?: number;
  isSmart?: boolean;
  filter?: string | null;
}

interface TagRecord {
  id: string;
  name: string;
  color: string;
}

interface ScanStatus {
  running: boolean;
  phase: string;
  discovered: number;
  indexed: number;
  skippedUnchanged: number;
  metadataProcessed: number;
  added: number;
  updated: number;
  removed: number;
  failed: number;
  errors: number;
  total: number;
  error: string | null;
}

const emptyScanStatus: ScanStatus = {
  running: false,
  phase: "idle",
  discovered: 0,
  indexed: 0,
  skippedUnchanged: 0,
  metadataProcessed: 0,
  added: 0,
  updated: 0,
  removed: 0,
  failed: 0,
  errors: 0,
  total: 0,
  error: null,
};

const CURRENT_ONBOARDING_VERSION = 1;

export default function Home() {
  return (
    <AudioPlayerProvider>
      <HomeContent />
    </AudioPlayerProvider>
  );
}

function HomeContent() {
  const [files, setFiles] = useState<FileRecord[]>([]);
  const [collections, setCollections] = useState<CollectionRecord[]>([]);
  const [directories, setDirectories] = useState<string[]>([]);
  const [tags, setTags] = useState<TagRecord[]>([]);
  const [selectedFile, setSelectedFile] = useState<FileRecord | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const selectionAnchorRef = useRef<string | null>(null);

  const handleClearSelection = useCallback(() => {
    setSelectedIds(clearSelection());
    selectionAnchorRef.current = null;
  }, []);
  const transportQueue = useTransportQueue();
  const {
    playIds,
    advanceIfEnabled,
    enqueue,
    clear: clearQueue,
    stepNext,
    stepPrev,
    autoplay,
    setAutoplay,
    queueState,
  } = transportQueue;
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteQuery, setPaletteQuery] = useState("");
  const [paletteIndex, setPaletteIndex] = useState(0);
  const paletteInputRef = useRef<HTMLInputElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const [shortcutBindings, setShortcutBindings] =
    useState<ShortcutBindings>(loadShortcutBindings);
  const [removeDefault, setRemoveDefault] =
    useState<RemoveDefault>(loadRemoveDefault);
  const [currentView, setCurrentView] = useState<
    "all" | "favorites" | "extensions" | "collection" | "directory" | "shelf"
  >("all");
  const [selectedCollection, setSelectedCollection] = useState<string | null>(
    null,
  );
  const [selectedTagId, setSelectedTagId] = useState<string | null>(null);
  const [favoritesCount, setFavoritesCount] = useState(0);
  const [selectedDirectory, setSelectedDirectory] = useState<string | null>(
    null,
  );
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [isPlayerPlaying, setIsPlayerPlaying] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showMobileSidebar, setShowMobileSidebar] = useState(false);
  const [settings, setSettings] = useState<{
    libraryRoot: string | null;
    libraryRoots: string[];
    onboardingVersion: number;
    stats: { activeFiles: number; removedFiles: number };
  }>({
    libraryRoot: null,
    libraryRoots: [],
    onboardingVersion: 0,
    stats: { activeFiles: 0, removedFiles: 0 },
  });
  const [scanStatus, setScanStatus] = useState<ScanStatus>(emptyScanStatus);
  const [extensions, setExtensions] = useState<ExtensionGridItem[]>([]);
  const [isLoadingExtensions, setIsLoadingExtensions] = useState(true);
  const [pendingExtensionId, setPendingExtensionId] = useState<string | null>(
    null,
  );
  const [soundShelfItemCount, setSoundShelfItemCount] = useState(0);
  const [selectedExtension, setSelectedExtension] =
    useState<ExtensionGridItem | null>(null);
  const audioPlayerRef = useRef<AudioPlayerRef>(null);
  const filesRequestIdRef = useRef(0);
  const directoriesRequestIdRef = useRef(0);
  const selectedFileRef = useRef(selectedFile);
  const filesRef = useRef(files);
  const tagsRef = useRef(tags);

  useEffect(() => { selectedFileRef.current = selectedFile; }, [selectedFile]);
  useEffect(() => { tagsRef.current = tags; }, [tags]);

  const [sortKey, setSortKey] = useState<"filename" | "duration">("filename");
  const [sortDir, setSortDir] = useState<1 | -1>(1);

  const flipSort = useCallback(
    (key: "filename" | "duration") => {
      if (key === sortKey) {
        setSortDir((prevDir) => (prevDir === 1 ? -1 : 1));
      } else {
        setSortKey(key);
        setSortDir(1);
      }
    },
    [sortKey],
  );

  const orderedFiles = useMemo(() => {
    const sorted = [...files];
    sorted.sort((a, b) => {
      if (sortKey === "duration") {
        const av = a.duration ?? Number.POSITIVE_INFINITY;
        const bv = b.duration ?? Number.POSITIVE_INFINITY;
        return (av - bv) * sortDir;
      }
      return a.filename.localeCompare(b.filename) * sortDir;
    });
    return sorted;
  }, [files, sortKey, sortDir]);

  useEffect(() => { filesRef.current = orderedFiles; }, [orderedFiles]);

  const { zoom, setZoom: handleUpdateZoom } = useZoom();

  const [folderJanitorOpen, setFolderJanitorOpen] = useState(false);
  const [folderJanitorTarget, setFolderJanitorTarget] = useState<
    "library" | "folder"
  >("library");
  const [folderJanitorFolderPath, setFolderJanitorFolderPath] = useState("");

  const [gatherOpen, setGatherOpen] = useState(false);

  const [packSource, setPackSource] = useState<
    "selection" | "shelf" | "recent" | null
  >(null);
  const [packFileIds, setPackFileIds] = useState<string[]>([]);

  const [renameHammerOpen, setRenameHammerOpen] = useState(false);
  const [showSaveSearch, setShowSaveSearch] = useState(false);
  const [renamingCollection, setRenamingCollection] = useState<{ id: string; name: string } | null>(null);

  const loadSoundShelfCount = useCallback(async () => {
    try {
      const res = await fetch("/api/extensions/sound-shelf");
      if (!res.ok) {
        setSoundShelfItemCount(0);
        return;
      }

      const data = (await res.json()) as { items?: Array<unknown> };
      setSoundShelfItemCount(data.items?.length ?? 0);
    } catch {
      setSoundShelfItemCount(0);
    }
  }, []);

  const showLibrary = useCallback(() => {
    setCurrentView("all");
    setSelectedCollection(null);
    setSelectedDirectory(null);
    setSelectedTagId(null);
    setSearchQuery("");
    handleClearSelection();
  }, [handleClearSelection]);

  const showFavorites = useCallback(() => {
    setCurrentView("favorites");
    setSelectedCollection(null);
    setSelectedDirectory(null);
    setSelectedTagId(null);
    setSearchQuery("");
    handleClearSelection();
  }, [handleClearSelection]);

  const showExtensions = useCallback(() => {
    setCurrentView("extensions");
    setSelectedCollection(null);
    setSelectedDirectory(null);
    setSelectedTagId(null);
    setSelectedFile(null);
    setSearchQuery("");
    handleClearSelection();
  }, [handleClearSelection]);

  const showShelf = useCallback(() => {
    setCurrentView("shelf");
    setSelectedCollection(null);
    setSelectedDirectory(null);
    setSelectedTagId(null);
    setSearchQuery("");
    handleClearSelection();
  }, [handleClearSelection]);

  const handleFilterTag = useCallback((id: string | null) => {
    setSelectedTagId(id);
  }, []);
  const showCollection = useCallback((collectionId: string) => {
    const collection = collections.find((c) => c.id === collectionId);
    if (collection?.isSmart && collection.filter) {
      try {
        const filter = JSON.parse(collection.filter) as { q?: string };
        setSearchQuery(filter.q ?? "");
        setCurrentView("all");
        setSelectedCollection(collectionId);
        setSelectedDirectory(null);
        handleClearSelection();
        return;
      } catch {
        // Invalid filter JSON, fall through to regular view
      }
    }
    setCurrentView("collection");
    setSelectedCollection(collectionId);
    setSelectedDirectory(null);
    setSearchQuery("");
    handleClearSelection();
  }, [collections, handleClearSelection]);

  const handleFilterCollection = useCallback(
    (id: string | null) => {
      if (id) {
        showCollection(id);
      } else {
        showLibrary();
      }
    },
    [showCollection, showLibrary],
  );

  const navigateDirectory = useCallback((directory: string | null) => {
    setCurrentView(directory ? "directory" : "all");
    setSelectedCollection(null);
    setSelectedDirectory(directory);
    handleClearSelection();
  }, [handleClearSelection]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 180);

    return () => {
      window.clearTimeout(timer);
    };
  }, [searchQuery]);

  const loadFiles = useCallback(async () => {
    const requestId = filesRequestIdRef.current + 1;
    filesRequestIdRef.current = requestId;

    if (currentView === "shelf") {
      setIsLoadingFiles(true);
      try {
        const res = await fetch("/api/extensions/sound-shelf");
        if (!res.ok) {
          throw new Error("Failed to fetch shelf");
        }

        const data = await res.json();
        if (filesRequestIdRef.current === requestId) {
          const items = (data.items ?? []) as FileRecord[];
          setFiles(items);
          setSoundShelfItemCount(items.length);
        }
      } catch {
        if (filesRequestIdRef.current === requestId) {
          toast.error("Failed to load shelf");
        }
      } finally {
        if (filesRequestIdRef.current === requestId) {
          setIsLoadingFiles(false);
        }
      }
      return;
    }

    if (currentView === "extensions") {
      setFiles([]);
      setIsLoadingFiles(false);
      return;
    }

    setIsLoadingFiles(true);
    const params = new URLSearchParams();
    if (debouncedSearchQuery.trim()) {
      params.set("q", debouncedSearchQuery.trim());
    } else {
      if (currentView === "directory" && selectedDirectory) {
        params.set("directory", selectedDirectory);
      } else if (currentView === "all") {
        if (selectedDirectory) {
          params.set("directory", selectedDirectory);
        } else {
          setFiles([]);
          setIsLoadingFiles(false);
          return;
        }
      }
    }

    if (currentView === "favorites") {
      params.set("favorites", "true");
    }
    if (currentView === "collection" && selectedCollection) {
      params.set("collectionId", selectedCollection);
    }
    if (selectedTagId) {
      params.set("tagId", selectedTagId);
    }

    try {
      const response = await fetch(`/api/files?${params.toString()}`);
      if (!response.ok) {
        throw new Error("Failed to fetch files");
      }

      const data = await response.json();
      if (filesRequestIdRef.current === requestId) {
        setFiles(data.files ?? []);
        if (typeof data.favoritesTotal === "number") {
          setFavoritesCount(data.favoritesTotal);
        }
      }
    } catch {
      if (filesRequestIdRef.current === requestId) {
        toast.error("Failed to load library");
      }
    } finally {
      if (filesRequestIdRef.current === requestId) {
        setIsLoadingFiles(false);
      }
    }
  }, [currentView, debouncedSearchQuery, selectedCollection, selectedDirectory, selectedTagId]);

  const loadDirectories = useCallback(async () => {
    const requestId = directoriesRequestIdRef.current + 1;
    directoriesRequestIdRef.current = requestId;

    if (
      debouncedSearchQuery.trim() ||
      selectedTagId ||
      currentView === "favorites" ||
      currentView === "collection" ||
      currentView === "extensions" ||
      currentView === "shelf"
    ) {
      setDirectories([]);
      return;
    }

    try {
      const params = new URLSearchParams();
      if (selectedDirectory) {
        params.set("parent", selectedDirectory);
      }
      const res = await fetch(`/api/directories?${params.toString()}`);
      const data = await res.json();
      if (directoriesRequestIdRef.current === requestId) {
        setDirectories(data.directories ?? []);
      }
    } catch (error) {
      if (directoriesRequestIdRef.current === requestId) {
        console.error("Failed to load directories:", error);
        toast.error("Failed to load directories");
      }
    }
  }, [debouncedSearchQuery, currentView, selectedDirectory, selectedTagId]);

  const loadInitialData = useCallback(async () => {
    setIsLoadingExtensions(true);

    try {
      const [
        settingsRes,
        collectionsRes,
        tagsRes,
        scanRes,
        extensionsRes,
      ] = await Promise.all([
        fetch("/api/settings"),
        fetch("/api/collections"),
        fetch("/api/tags"),
        fetch("/api/scan"),
        fetch("/api/extensions"),
      ]);

      const [
        settingsData,
        collectionsData,
        tagsData,
        scanData,
        extensionsData,
      ] = await Promise.all([
        settingsRes.json(),
        collectionsRes.json(),
        tagsRes.json(),
        scanRes.json(),
        extensionsRes.json(),
      ]);

      const nextLibraryRoots =
        settingsData.libraryRoots ??
        (settingsData.libraryRoot ? [settingsData.libraryRoot] : []);
      const nextOnboardingVersion = settingsData.onboardingVersion ?? 0;

      setSettings({
        ...settingsData,
        libraryRoots: nextLibraryRoots,
        onboardingVersion: nextOnboardingVersion,
      });
      setShowOnboarding(
        nextOnboardingVersion < CURRENT_ONBOARDING_VERSION &&
        nextLibraryRoots.length === 0,
      );
      setCollections(collectionsData.collections ?? []);
      setTags(tagsData.tags ?? []);
      setScanStatus(scanData);

      const nextExtensions = (extensionsData.extensions ?? []) as ExtensionGridItem[];
      setExtensions(nextExtensions);

      if (
        nextExtensions.some(
          (extension) => extension.id === "sound-shelf" && extension.enabled,
        )
      ) {
        void loadSoundShelfCount();
      } else {
        setSoundShelfItemCount(0);
      }
    } catch {
      toast.error("Failed to sync with server");
    } finally {
      setIsLoadingExtensions(false);
    }
  }, [loadSoundShelfCount]);

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

  const loadFavoritesCount = useCallback(async () => {
    try {
      const res = await fetch("/api/files?favorites=true&limit=1");
      if (!res.ok) {
        return;
      }

      const data = (await res.json()) as { favoritesTotal?: number };
      if (typeof data.favoritesTotal === "number") {
        setFavoritesCount(data.favoritesTotal);
      }
    } catch {
      // Badge keeps its last count.
    }
  }, []);

  const handleToggleFavorite = useCallback(async (id: string) => {
    try {
      const res = await fetch("/api/files", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action: "toggleFavorite" }),
      });
      if (!res.ok) {
        throw new Error();
      }

      setFiles((prev) =>
        prev.map((file) =>
          file.id === id ? { ...file, isFavorite: !file.isFavorite } : file,
        ),
      );

      setSelectedFile((prev) =>
        prev?.id === id ? { ...prev, isFavorite: !prev.isFavorite } : prev,
      );

      void loadFavoritesCount();
    } catch {
      toast.error("Failed to update favorite status");
    }
  }, [loadFavoritesCount]);

  const handleToggleFileTag = useCallback(async (fileId: string, tagId: string) => {
    const currentFiles = filesRef.current;
    const currentTags = tagsRef.current;
    const currentSelectedFile = selectedFileRef.current;

    const file = currentFiles.find((f) => f.id === fileId);
    if (!file) return;

    const alreadyAttached = file.tags.some((t) => t.id === tagId);
    const action = alreadyAttached ? "detachTag" : "attachTag";

    setFiles((prev) =>
      prev.map((f) =>
        f.id === fileId
          ? {
              ...f,
              tags: alreadyAttached
                ? f.tags.filter((t) => t.id !== tagId)
                : [...f.tags, currentTags.find((t) => t.id === tagId) ?? { id: tagId, name: "" }],
            }
          : f,
      ),
    );

    if (currentSelectedFile?.id === fileId) {
      setSelectedFile((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          tags: alreadyAttached
            ? prev.tags.filter((t) => t.id !== tagId)
            : [...prev.tags, currentTags.find((t) => t.id === tagId) ?? { id: tagId, name: "" }],
        };
      });
    }

    try {
      await fetch("/api/files", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: fileId, action, tagId }),
      });
    } catch {
      setFiles((prev) =>
        prev.map((f) =>
          f.id === fileId ? file : f,
        ),
      );
      if (currentSelectedFile?.id === fileId) {
        setSelectedFile(file);
      }
      toast.error("Failed to update tag");
    }
  }, []);

  const [confirmBulkRemove, setConfirmBulkRemove] = useState<
    | { stage: "choose" }
    | { stage: "confirm"; choice: RemoveDefault }
    | null
  >(null);
  const [confirmClearShelf, setConfirmClearShelf] = useState(false);

  useEffect(() => {
    if (!confirmClearShelf) {
      return;
    }
    const timer = window.setTimeout(() => setConfirmClearShelf(false), 4000);
    return () => window.clearTimeout(timer);
  }, [confirmClearShelf]);

  const handleRebindShortcut = useCallback(
    (action: ShortcutAction, key: string) => {
      setShortcutBindings((prev) => {
        const next = { ...prev, [action]: key };
        persistShortcutBindings(next);
        return next;
      });
    },
    [],
  );

  const handleResetShortcuts = useCallback(() => {
    setShortcutBindings({ ...DEFAULT_SHORTCUTS });
    persistShortcutBindings({ ...DEFAULT_SHORTCUTS });
  }, []);

  const handleRemoveDefaultChange = useCallback((value: RemoveDefault) => {
    setRemoveDefault(value);
    persistRemoveDefault(value);
  }, []);

  const selectedIdsRef = useRef(selectedIds);
  useEffect(() => {
    selectedIdsRef.current = selectedIds;
  }, [selectedIds]);

  const handleBulkSaveAll = useCallback(async () => {
    const unfavorited = selectedIdsRef.current.filter(
      (id) => !filesRef.current.find((file) => file.id === id)?.isFavorite,
    );
    await Promise.all(unfavorited.map((id) => handleToggleFavorite(id)));
    void loadFavoritesCount();
  }, [handleToggleFavorite, loadFavoritesCount]);

  const handleBulkAddToQueue = useCallback(() => {
    enqueue(selectedIdsRef.current);
  }, [enqueue]);

  const handleBulkAddToShelf = useCallback(async () => {
    const ids = selectedIdsRef.current;
    if (ids.length === 0) {
      return;
    }

    try {
      const res = await fetch("/api/extensions/sound-shelf/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileIds: ids }),
      });
      if (!res.ok) {
        throw new Error();
      }

      window.dispatchEvent(new CustomEvent(SOUND_SHELF_CHANGED_EVENT));
      void loadSoundShelfCount();
      toast.success(`Added ${ids.length} sound(s) to Shelf`);
    } catch {
      toast.error("Failed to add sounds to Shelf");
    }
  }, [loadSoundShelfCount]);

  const handleBulkTag = useCallback(async (tagId: string) => {
    const missing = selectedIdsRef.current.filter(
      (id) =>
        !filesRef.current
          .find((file) => file.id === id)
          ?.tags.some((tag) => tag.id === tagId),
    );
    await Promise.all(
      missing.map((id) => handleToggleFileTag(id, tagId)),
    );
  }, [handleToggleFileTag]);

  const executeBulkRemove = useCallback(async () => {
    const choice =
      confirmBulkRemove?.stage === "confirm" ? confirmBulkRemove.choice : null;
    const ids = selectedIdsRef.current;
    setConfirmBulkRemove(null);

    if (!choice || ids.length === 0) {
      return;
    }

    try {
      const res = await fetch("/api/files", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileIds: ids,
          permanent: choice === "disk",
        }),
      });
      if (!res.ok) {
        throw new Error();
      }

      const data = (await res.json()) as {
        removed?: string[];
        failed?: Array<{ id: string }>;
      };
      const removedIds = new Set(data.removed ?? ids);

      setFiles((prev) => prev.filter((file) => !removedIds.has(file.id)));
      handleClearSelection();

      if (
        selectedFileRef.current &&
        removedIds.has(selectedFileRef.current.id)
      ) {
        clearQueue();
        setSelectedFile(null);
        setIsPlayerPlaying(false);
      }

      if (data.failed && data.failed.length > 0) {
        toast.error(`Could not remove ${data.failed.length} file(s)`);
      } else if (choice === "disk") {
        toast.success(`Deleted ${removedIds.size} file(s) from disk`);
      } else {
        toast.success(`Removed ${removedIds.size} file(s) from library`);
      }

      void loadFavoritesCount();
    } catch {
      toast.error("Failed to remove files");
    }
  }, [confirmBulkRemove, handleClearSelection, clearQueue, loadFavoritesCount]);

  const handleSaveSearch = useCallback(async (name: string) => {
    if (!name.trim() || !debouncedSearchQuery.trim()) return;

    try {
      const res = await fetch(
        "/api/extensions/smart-collections/save-search",
        {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          query: debouncedSearchQuery.trim(),
        }),
        },
      );
      if (!res.ok) throw new Error();
      await loadInitialData();
      toast.success("Smart collection saved");
      setShowSaveSearch(false);
    } catch {
      toast.error("Failed to save smart collection");
    }
  }, [debouncedSearchQuery, loadInitialData]);

  const handleRenameCollection = useCallback(async (id: string, name: string) => {
    if (!name.trim()) return;
    try {
      const res = await fetch("/api/collections", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "rename", collectionId: id, name: name.trim() }),
      });
      if (!res.ok) throw new Error();
      void loadInitialData();
      toast.success("Collection renamed");
    } catch {
      toast.error("Failed to rename collection");
    }
  }, [loadInitialData]);

  const handleUpdateCollectionFilter = useCallback(async (id: string, filter: string) => {
    try {
      const res = await fetch("/api/collections", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update-filter", collectionId: id, filter }),
      });
      if (!res.ok) throw new Error();
      void loadInitialData();
      toast.success("Search filter updated");
    } catch {
      toast.error("Failed to update search filter");
    }
  }, [loadInitialData]);

  const handleConvertToRegularCollection = useCallback(async (collectionId: string) => {
    try {
      const res = await fetch("/api/collections", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "convert-to-regular", collectionId }),
      });
      if (!res.ok) throw new Error();
      void loadInitialData();
      toast.success("Converted to collection");
    } catch {
      toast.error("Failed to convert collection");
    }
  }, [loadInitialData]);

  const saveLibraryRoot = useCallback(async (path: string) => {
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save", path }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error ?? "Failed to save settings");
      }

      setSettings({
        libraryRoot: data.libraryRoot,
        libraryRoots: data.libraryRoots ?? (data.libraryRoot ? [data.libraryRoot] : []),
        onboardingVersion: data.onboardingVersion ?? settings.onboardingVersion,
        stats: data.stats,
      });
      setScanStatus((current) => ({
        ...current,
        libraryRoot: data.libraryRoot,
        stats: data.stats,
      }));
      return true;
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to save settings",
      );
      return false;
    }
  }, [settings]);

  const handleSaveRoot = useCallback(async (path: string) => {
    await saveLibraryRoot(path);
  }, [saveLibraryRoot]);

  const startLibraryScan = useCallback(async () => {
    try {
      const res = await fetch("/api/scan", { method: "POST" });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error ?? "Failed to start scan");
      }

      setScanStatus(data.status);
      toast.info("Scan started");
      return true;
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to start scan",
      );
      return false;
    }
  }, []);

  const handleStartScan = useCallback(async () => {
    await startLibraryScan();
  }, [startLibraryScan]);

  const handleCompleteOnboarding = useCallback(async () => {
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "onboarding_complete" }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error ?? "Failed to complete onboarding");
      }

      setSettings((current) => ({
        ...current,
        onboardingVersion: data.onboardingVersion ?? CURRENT_ONBOARDING_VERSION,
      }));
      return true;
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to complete onboarding",
      );
      return false;
    }
  }, []);

  const handleCreateCollection = useCallback(async (name: string) => {
    if (!name.trim()) {
      return;
    }

    try {
      const res = await fetch("/api/collections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (!res.ok) {
        throw new Error();
      }

      void loadInitialData();
      toast.success("Collection created");
    } catch {
      toast.error("Failed to create collection");
    }
  }, [loadInitialData]);

  const executeDeleteCollection = useCallback(async (collectionId: string) => {
    const deletedCollection = collections.find(
      (collection) => collection.id === collectionId,
    );
    setCollections((current) =>
      current.filter((collection) => collection.id !== collectionId),
    );

    const wasSelected = selectedCollection === collectionId;
    if (wasSelected) {
      setSelectedCollection(null);
      setCurrentView("all");
    }

    try {
      const res = await fetch("/api/collections", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ collectionId }),
      });
      if (!res.ok) {
        throw new Error();
      }

      toast.success("Collection deleted");
    } catch {
      if (deletedCollection) {
        setCollections((current) =>
          current.some((collection) => collection.id === deletedCollection.id)
            ? current
            : [...current, deletedCollection].sort((a, b) =>
                a.name.localeCompare(b.name),
              ),
        );
      }
      if (wasSelected) {
        setSelectedCollection(collectionId);
        setCurrentView("collection");
      }
      toast.error("Failed to delete collection");
    }
  }, [collections, selectedCollection]);

  const handleDeleteCollection = useCallback(async (collectionId: string) => {
    await executeDeleteCollection(collectionId);
  }, [executeDeleteCollection]);

  const handleRemoveRoot = useCallback(async (path: string) => {
    const previousSettings = settings;
    const nextRoots = settings.libraryRoots.filter((root) => root !== path);

    setSettings({
      ...settings,
      libraryRoot: nextRoots[0] ?? null,
      libraryRoots: nextRoots,
    });

    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "remove", path }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error ?? "Failed to remove library folder");
      }

      setSettings({
        libraryRoot: data.libraryRoot,
        libraryRoots: data.libraryRoots ?? (data.libraryRoot ? [data.libraryRoot] : []),
        onboardingVersion: data.onboardingVersion ?? settings.onboardingVersion,
        stats: data.stats,
      });
    } catch (error) {
      setSettings(previousSettings);
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to remove library folder",
      );
    }
  }, [settings]);

  const handleCreateTag = useCallback(async (name: string) => {
    if (!name.trim()) {
      return;
    }

    try {
      await fetch("/api/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      void loadInitialData();
      toast.success("Tag created");
    } catch {
      toast.error("Failed to create tag");
    }
  }, [loadInitialData]);

  const handleDeleteTag = useCallback(async (tagId: string) => {
    const deletedTag = tags.find((tag) => tag.id === tagId);
    setTags((current) => current.filter((tag) => tag.id !== tagId));

    try {
      const res = await fetch("/api/tags", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tagId }),
      });
      if (!res.ok) {
        throw new Error();
      }

      toast.success("Tag deleted");
    } catch {
      if (deletedTag) {
        setTags((current) =>
          current.some((tag) => tag.id === deletedTag.id)
            ? current
            : [...current, deletedTag].sort((a, b) =>
                a.name.localeCompare(b.name),
              ),
        );
      }
      toast.error("Failed to delete tag");
    }
  }, [tags]);

  const extensionsRef = useRef(extensions);

  useEffect(() => {
    extensionsRef.current = extensions;
  }, [extensions]);

  const handleToggleExtensionEnabled = useCallback(
    async (extensionId: string, enabled: boolean) => {
      setPendingExtensionId(extensionId);
      const previousExtensions = extensionsRef.current;
      setExtensions((current) =>
        current.map((extension) =>
          extension.id === extensionId ? { ...extension, enabled } : extension,
        ),
      );

      try {
        const res = await fetch("/api/extensions", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ extensionId, enabled }),
        });
        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error ?? "Failed to update extension");
        }

        setExtensions((current) =>
          current.map((extension) =>
            extension.id === extensionId ? data.extension : extension,
          ),
        );

        if (extensionId === "sound-shelf") {
          if (enabled) {
            void loadSoundShelfCount();
          } else {
            setSoundShelfItemCount(0);
          }
        }

        toast.success(enabled ? "Extension enabled" : "Extension disabled");
      } catch (error) {
        setExtensions(previousExtensions);
        toast.error(
          error instanceof Error
            ? error.message
            : "Failed to update extension",
        );
      } finally {
        setPendingExtensionId(null);
      }
    },
    [loadSoundShelfCount],
  );

  const handleUpdateExtensionSetting = useCallback(
    async (extensionId: string, settingId: string, value: unknown) => {
      const previousExtensions = extensionsRef.current;
      setExtensions((current) =>
        current.map((extension) =>
          extension.id === extensionId
            ? {
                ...extension,
                settings: extension.settings?.map((setting) =>
                  setting.id === settingId ? { ...setting, value } : setting,
                ),
              }
            : extension,
        ),
      );

      try {
        const res = await fetch("/api/extensions", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ extensionId, settingId, value }),
        });
        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error ?? "Failed to update extension setting");
        }

        setExtensions((current) =>
          current.map((extension) =>
            extension.id === extensionId ? data.extension : extension,
          ),
        );
        toast.success("Extension setting saved");
      } catch (error) {
        setExtensions(previousExtensions);
        toast.error(
          error instanceof Error
            ? error.message
            : "Failed to update extension setting",
        );
      }
    },
    [],
  );

  const handleAddToCollection = useCallback(async (collectionId: string) => {
    if (!selectedFile) {
      return;
    }

    const collection = collections.find(
      (collection) => collection.id === collectionId,
    );

    try {
      const res = await fetch("/api/collections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileId: selectedFile.id,
          collectionId,
        }),
      });
      if (!res.ok) {
        throw new Error();
      }

      await loadInitialData();
      toast.success(`Added to ${collection?.name ?? "collection"}`);
    } catch {
      toast.error("Failed to add to collection");
    }
  }, [selectedFile, collections, loadInitialData]);

  const executeHostedCommand = useCallback(
    async (
      extensionId: string,
      commandId: string,
      selection?: { fileIds?: string[]; folderPath?: string },
      input?: unknown,
    ) => {
      try {
        const response = await fetch("/api/extensions/execute", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ extensionId, commandId, selection, input }),
        });
        const outcome = (await response.json()) as YardExtensionHostOutcome;

        if (!response.ok || !outcome.ok) {
          throw new Error(
            outcome.ok ? "Extension command failed" : outcome.message,
          );
        }

        if (outcome.type === "ui-intent") {
          const handled = interpretExtensionUiIntent(outcome.intent, {
            openFolderJanitor: (payload) => {
              setFolderJanitorTarget(payload.target);
              setFolderJanitorFolderPath(
                payload.target === "folder" ? payload.folderPath : "",
              );
              setFolderJanitorOpen(true);
            },
            openLibraryGatherer: () => setGatherOpen(true),
            openMakePack: ({ source, fileIds }) => {
              if (source === "shelf" && !isDesktopApp()) {
                toast.error(
                  "Make Pack needs the desktop app to choose an output folder",
                );
                return;
              }
              setCurrentView("all");
              setPackSource(source);
              setPackFileIds(fileIds);
            },
            openSettings: () => setShowSettings(true),
          });

          if (!handled) {
            toast.info(`No UI handles intent "${outcome.intent.type}" yet`);
          }
        }

        if (outcome.type === "value" && extensionId === "sound-shelf") {
          window.dispatchEvent(
            new CustomEvent(SOUND_SHELF_CHANGED_EVENT),
          );
        }
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "Failed to run extension command",
        );
      }
    },
    [],
  );

  const handleScanFolder = useCallback(
    (folderPath: string) => {
      void executeHostedCommand(
        "folder-janitor",
        "folder-janitor.scan-folder",
        { folderPath },
      );
    },
    [executeHostedCommand],
  );

  const handleRunCommand = useCallback(
    (extensionId: string, commandId: string) => {
      if (commandId === "rename-hammer.open") {
        setRenameHammerOpen(true);
        return;
      }

      void executeHostedCommand(extensionId, commandId);
    },
    [executeHostedCommand],
  );

  useScanPolling(
    scanStatus,
    useCallback((data) => setScanStatus(data), []),
    useCallback(() => {
      void loadFiles();
      void loadInitialData();
      toast.success("Scan complete");
    }, [loadFiles, loadInitialData]),
  );

  const selectedCollectionName = useMemo(() =>
    currentView === "collection"
      ? (collections.find((c) => c.id === selectedCollection)?.name ?? null)
      : null,
  [currentView, collections, selectedCollection]);

  const showExtensionsView = currentView === "extensions";
  const showShelfView = currentView === "shelf";
  const hideHeaderActions = showExtensionsView || showShelfView;

  const railView: RailView | null =
    currentView === "all" ||
    currentView === "collection" ||
    currentView === "directory"
      ? "library"
      : currentView === "favorites"
        ? "favorites"
        : currentView === "shelf"
          ? "shelf"
          : currentView === "extensions"
            ? "extensions"
            : null;

  const viewHeading =
    currentView === "favorites"
      ? "Favorites"
      : currentView === "extensions"
        ? "Tools"
        : currentView === "shelf"
          ? "Shelf"
          : currentView === "collection"
            ? (selectedCollectionName ?? "Library")
            : currentView === "directory"
              ? (selectedDirectory?.split(/[\\/]/).pop() ?? "Library")
              : "Library";

  const {
    soundShelfEnabled,
    makePackEnabled,
    folderJanitorEnabled,
    smartCollectionsEnabled,
    viewingSmartCollection,
    activeSmartCollectionId,
  } = useMemo(() => {
    const shelf = extensions.find((e) => e.id === "sound-shelf")?.enabled ?? false;
    const pack = extensions.find((e) => e.id === "make-pack")?.enabled ?? false;
    const janitor = extensions.find((e) => e.id === "folder-janitor")?.enabled ?? false;
    const smart = extensions.find((e) => e.id === "smart-collections")?.enabled ?? false;
    const activeSmart = selectedCollection
      ? collections.find((c) => c.id === selectedCollection && c.isSmart) ?? null
      : null;
    return {
      soundShelfEnabled: shelf,
      makePackEnabled: pack,
      folderJanitorEnabled: janitor,
      smartCollectionsEnabled: smart,
      viewingSmartCollection: activeSmart !== null,
      activeSmartCollectionId: activeSmart?.id ?? null,
    };
  }, [extensions, selectedCollection, collections]);

  const handleOpenMobileSidebar = useCallback(() => setShowMobileSidebar(true), []);
  const handleCloseMobileSidebar = useCallback(() => setShowMobileSidebar(false), []);
  const handleOpenSettings = useCallback(() => setShowSettings(true), []);

  const makePackDefaultFormat = useMemo(() => {
    const value = extensions
      .find((e) => e.id === "make-pack")
      ?.settings?.find((s) => s.id === "default-format")?.value;
    return value === "zip" || value === "folder" ? value : "zip";
  }, [extensions]);

  const handleSelectFile = useCallback((file: FileRecord, _index: number, modifiers: SelectModifiers = {}) => {
    if (modifiers.shiftKey) {
      const orderedIds = filesRef.current.map((listed) => listed.id);
      setSelectedIds(rangeSelect(orderedIds, selectionAnchorRef.current, file.id));
      return;
    }

    if (modifiers.ctrlKey || modifiers.metaKey) {
      setSelectedIds((prev) => toggleInSelection(prev, file.id));
      selectionAnchorRef.current = file.id;
      return;
    }

    if (selectedFileRef.current?.id === file.id) {
      audioPlayerRef.current?.togglePlayback();
    } else {
      playIds(
        filesRef.current.map((listed) => listed.id),
        file.id,
      );
      setSelectedFile(file);
    }

    setSelectedIds([file.id]);
    selectionAnchorRef.current = file.id;
  }, [playIds]);

  const handleMoveSelection = useCallback(
    (direction: 1 | -1) => {
      const visible = filesRef.current;
      if (visible.length === 0) {
        return;
      }

      const currentId =
        selectedFileRef.current?.id ??
        selectedIdsRef.current[selectedIdsRef.current.length - 1];
      const index = visible.findIndex((file) => file.id === currentId);
      const next =
        visible[(index + direction + visible.length) % visible.length];
      if (!next) {
        return;
      }

      playIds(
        visible.map((listed) => listed.id),
        next.id,
      );
      setSelectedFile(next);
      setSelectedIds([next.id]);
      selectionAnchorRef.current = next.id;

      const row = document.querySelector(`[data-file-id="${CSS.escape(next.id)}"]`);
      if (row instanceof HTMLElement) {
        row.scrollIntoView({ block: "nearest" });
        row.focus({ preventScroll: true });
      }
    },
    [playIds],
  );

  const handleTrackEnded = useCallback(() => {
    const nextId = advanceIfEnabled();
    if (!nextId) {
      return;
    }

    const match = filesRef.current.find((file) => file.id === nextId);
    if (match) {
      setSelectedFile(match);
    }
  }, [advanceIfEnabled]);

  const handleStepNext = useCallback(() => {
    const nextId = stepNext();
    if (!nextId) {
      return;
    }

    const match = filesRef.current.find((file) => file.id === nextId);
    if (match) {
      setSelectedFile(match);
    }
  }, [stepNext]);

  const handleStepPrev = useCallback(() => {
    const prevId = stepPrev();
    if (!prevId) {
      return;
    }

    const match = filesRef.current.find((file) => file.id === prevId);
    if (match) {
      setSelectedFile(match);
    }
  }, [stepPrev]);

  const handleToggleAutoplay = useCallback(
    (checked: boolean) => {
      setAutoplay(checked);
    },
    [setAutoplay],
  );

  const nextTitle = useMemo(() => {
    if (queueState.queue.length <= 1) {
      return null;
    }

    const nextIndex =
      (queueState.cursor + 1) % queueState.queue.length;
    const nextId = queueState.queue[nextIndex];
    if (!nextId || nextId === selectedFile?.id) {
      const following = queueState.queue.find((id) => id !== selectedFile?.id);
      if (!following) {
        return null;
      }

      const followingMatch = files.find(
        (file) => file.id === following,
      );
      return (
        followingMatch?.filename.replace(/\.[^.]+$/, "") ??
        followingMatch?.filename ??
        null
      );
    }

    const match = files.find((file) => file.id === nextId);
    return (
      match?.filename.replace(/\.[^.]+$/, "") ?? match?.filename ?? null
    );
  }, [queueState, selectedFile?.id, files]);

  const handleMakePackFile = useCallback(
    (file: FileRecord) =>
      executeHostedCommand(
        "make-pack",
        "make-pack.from-selection",
        { fileIds: [file.id] },
      ),
    [executeHostedCommand],
  );

  const handleMakePackShelf = useCallback(
    () => executeHostedCommand("make-pack", "make-pack.from-shelf"),
    [executeHostedCommand],
  );

  const handleClearShelf = useCallback(async () => {
    try {
      const res = await fetch("/api/extensions/sound-shelf/clear", {
        method: "POST",
      });
      if (!res.ok) {
        throw new Error();
      }

      window.dispatchEvent(new CustomEvent(SOUND_SHELF_CHANGED_EVENT));
    } catch {
      toast.error("Failed to clear Shelf");
    }
  }, []);

  const handleClosePlayer = useCallback(() => {
    clearQueue();
    setSelectedFile(null);
    setIsPlayerPlaying(false);
  }, [clearQueue]);

  const openPalette = useCallback(() => {
    setPaletteQuery("");
    setPaletteIndex(0);
    setPaletteOpen(true);
  }, []);

  const closePalette = useCallback(() => {
    setPaletteOpen(false);
  }, []);

  const handlePaletteQueryChange = useCallback((query: string) => {
    setPaletteQuery(query);
    setPaletteIndex(0);
  }, []);

  const handleAddCurrentToShelf = useCallback(async () => {
    const current = selectedFileRef.current;
    if (!current) {
      return;
    }

    try {
      const res = await fetch("/api/extensions/sound-shelf/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileIds: [current.id] }),
      });
      if (!res.ok) {
        throw new Error();
      }

      window.dispatchEvent(new CustomEvent(SOUND_SHELF_CHANGED_EVENT));
      void loadSoundShelfCount();
      toast.success("Added to Shelf");
    } catch {
      toast.error("Failed to add to Shelf");
    }
  }, [loadSoundShelfCount]);

  const paletteToolCommands = useMemo(
    () =>
      extensions.flatMap((extension) =>
        extension.enabled
          ? ((extension.commands ?? []).map((command) => ({
              extensionId: extension.id,
              extensionName: extension.name,
              commandId: command.id,
              title: command.title,
            })) as Array<{
              extensionId: string;
              extensionName: string;
              commandId: string;
              title: string;
            }>)
          : [],
      ),
    [extensions],
  );

  const paletteSounds = useMemo(
    () =>
      orderedFiles.map((file) => ({
        id: file.id,
        filename: file.filename,
        format: file.format,
        duration: file.duration,
        tags: file.tags.map((tag) => tag.name),
      })),
    [orderedFiles],
  );

  const paletteEntries = useMemo(
    () =>
      buildPaletteEntries({
        query: paletteQuery,
        isPlaying: isPlayerPlaying,
        autoplay,
        hasCurrentFile: selectedFile !== null,
        canStepQueue: queueState.queue.length > 1,
        isFavorite: selectedFile?.isFavorite ?? false,
        shelfEnabled: soundShelfEnabled,
        toolCommands: paletteToolCommands,
        sounds: paletteSounds,
      }),
    [
      paletteQuery,
      isPlayerPlaying,
      autoplay,
      selectedFile,
      queueState,
      soundShelfEnabled,
      paletteToolCommands,
      paletteSounds,
    ],
  );

  const activePaletteIndex =
    paletteEntries.length === 0
      ? 0
      : Math.min(paletteIndex, paletteEntries.length - 1);

  const handlePaletteSelect = useCallback(
    (entry: PaletteEntry) => {
      const separator = entry.id.indexOf(":");
      const kind = separator === -1 ? entry.id : entry.id.slice(0, separator);
      const rest = separator === -1 ? "" : entry.id.slice(separator + 1);

      switch (kind) {
        case "view": {
          if (rest === "library") showLibrary();
          else if (rest === "favorites") showFavorites();
          else if (rest === "shelf") showShelf();
          else if (rest === "tools") showExtensions();
          else if (rest === "settings") setShowSettings(true);
          break;
        }
        case "transport": {
          if (rest === "toggle-play") audioPlayerRef.current?.togglePlayback();
          else if (rest === "next") handleStepNext();
          else if (rest === "prev") handleStepPrev();
          else if (rest === "autoplay") setAutoplay(!autoplay);
          break;
        }
        case "file": {
          if (rest === "toggle-favorite" && selectedFileRef.current) {
            void handleToggleFavorite(selectedFileRef.current.id);
          } else if (rest === "add-to-shelf") {
            void handleAddCurrentToShelf();
          }
          break;
        }
        case "tool": {
          const split = rest.indexOf(":");
          if (split !== -1) {
            handleRunCommand(rest.slice(0, split), rest.slice(split + 1));
          }
          break;
        }
        case "sound": {
          const match = filesRef.current.find((file) => file.id === rest);
          if (match) {
            playIds(
              filesRef.current.map((listed) => listed.id),
              match.id,
            );
            setSelectedFile(match);
          }
          break;
        }
      }

      setPaletteOpen(false);
    },
    [
      showLibrary,
      showFavorites,
      showShelf,
      showExtensions,
      handleStepNext,
      handleStepPrev,
      autoplay,
      setAutoplay,
      playIds,
      handleToggleFavorite,
      handleAddCurrentToShelf,
      handleRunCommand,
    ],
  );

  useEffect(() => {
    if (paletteOpen) {
      paletteInputRef.current?.focus();
    }
  }, [paletteOpen]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        if (paletteOpen) {
          setPaletteOpen(false);
        } else {
          setPaletteQuery("");
          setPaletteIndex(0);
          setPaletteOpen(true);
        }
        return;
      }

      if (!paletteOpen) {
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        setPaletteOpen(false);
        return;
      }

      if (event.key === "ArrowDown") {
        event.preventDefault();
        event.stopPropagation();
        setPaletteIndex((index) => (index + 1) % Math.max(1, paletteEntries.length));
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        event.stopPropagation();
        setPaletteIndex(
          (index) =>
            (index - 1 + Math.max(1, paletteEntries.length)) %
            Math.max(1, paletteEntries.length),
        );
        return;
      }

      if (event.key === "Enter") {
        const target = event.target as HTMLElement | null;
        const inPaletteInput = target === paletteInputRef.current;
        const entry = paletteEntries[activePaletteIndex];
        if (entry && (inPaletteInput || target === document.body)) {
          event.preventDefault();
          event.stopPropagation();
          handlePaletteSelect(entry);
        }
      }
    };

    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [paletteOpen, paletteEntries, activePaletteIndex, handlePaletteSelect]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      if (paletteOpen) {
        return;
      }

      if (matchShortcutKey(event, shortcutBindings["toggle-playback"])) {
        if (shouldSkipSpace(event.target)) {
          return;
        }

        event.preventDefault();
        audioPlayerRef.current?.togglePlayback();
        return;
      }

      if (isTypingTarget(event.target)) {
        return;
      }

      if (matchShortcutKey(event, shortcutBindings["focus-search"])) {
        event.preventDefault();
        searchInputRef.current?.focus();
      } else if (
        matchShortcutKey(event, shortcutBindings["toggle-favorite"])
      ) {
        const current = selectedFileRef.current;
        if (current) {
          void handleToggleFavorite(current.id);
        }
      } else if (matchShortcutKey(event, shortcutBindings["move-next"])) {
        event.preventDefault();
        handleMoveSelection(1);
      } else if (matchShortcutKey(event, shortcutBindings["move-prev"])) {
        event.preventDefault();
        handleMoveSelection(-1);
      } else if (matchShortcutKey(event, shortcutBindings["open-settings"])) {
        event.preventDefault();
        setShowSettings(true);
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [paletteOpen, shortcutBindings, handleMoveSelection, handleToggleFavorite]);

  const handleCloseExtensionDetails = useCallback((open: boolean) => {
    if (!open) setSelectedExtension(null);
  }, []);

  const handleCloseGather = useCallback((open: boolean) => {
    if (!open) setGatherOpen(false);
  }, []);

  const handleClosePack = useCallback((open: boolean) => {
    if (!open) setPackSource(null);
  }, []);

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-canvas font-sans">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,color-mix(in_oklab,var(--accent-fill)_13%,transparent),transparent_38%),radial-gradient(circle_at_bottom_right,color-mix(in_oklab,var(--accent-fill)_6%,transparent),transparent_40%)]" />
      <div className="relative flex min-h-0 flex-1">

      <IconRail
        className="hidden md:flex"
        activeView={railView}
        favoritesCount={favoritesCount}
        shelfCount={soundShelfItemCount}
        onSelectLibrary={showLibrary}
        onSelectFavorites={showFavorites}
        onSelectShelf={showShelf}
        onSelectExtensions={showExtensions}
        onOpenSettings={handleOpenSettings}
        settingsActive={showSettings}
        collections={collections}
        tags={tags}
        selectedCollection={selectedCollection}
        selectedTagId={selectedTagId}
        onSelectCollection={handleFilterCollection}
        onSelectTag={handleFilterTag}
      />

      <Dialog open={showMobileSidebar} onOpenChange={setShowMobileSidebar}>
        <DialogContent
          showCloseButton={false}
          className="left-0 top-0 h-full w-auto translate-x-0 translate-y-0 rounded-none border-r border-white/10 bg-shell/95 p-2 shadow-2xl backdrop-blur-2xl duration-300 ease-out data-open:slide-in-from-left-8 data-open:fade-in-0 data-closed:slide-out-to-left-8 data-closed:fade-out-0"
        >
          <DialogTitle className="sr-only">Navigation Menu</DialogTitle>
          <IconRail
            activeView={railView}
            favoritesCount={favoritesCount}
            shelfCount={soundShelfItemCount}
            onSelectLibrary={() => {
              showLibrary();
              handleCloseMobileSidebar();
            }}
            onSelectFavorites={() => {
              showFavorites();
              handleCloseMobileSidebar();
            }}
            onSelectShelf={() => {
              showShelf();
              handleCloseMobileSidebar();
            }}
            onSelectExtensions={() => {
              showExtensions();
              handleCloseMobileSidebar();
            }}
            onOpenSettings={() => {
              handleOpenSettings();
              handleCloseMobileSidebar();
            }}
            settingsActive={showSettings}
            collections={collections}
            tags={tags}
            selectedCollection={selectedCollection}
            selectedTagId={selectedTagId}
            onSelectCollection={(id) => {
              handleFilterCollection(id);
              handleCloseMobileSidebar();
            }}
            onSelectTag={(id) => {
              handleFilterTag(id);
              handleCloseMobileSidebar();
            }}
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
              onClick={handleOpenMobileSidebar}
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
                        handleUpdateCollectionFilter(
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
                  onClick={() => setShowSaveSearch(true)}
                >
                  <Save className="size-4" />
                  Save Search
                </Button>
              </>
            )}

            {isLoadingFiles && (
              <Loader2 className="size-4 shrink-0 animate-spin text-accent-text" />
            )}
          </div>
        </header>

        <div className="px-4 pt-4 md:px-5">
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
                    onClick={() => void handleMakePackShelf()}
                  >
                    <PackagePlus className="size-4" />
                    Pack Shelf
                  </Button>
                ) : null}
                {files.length > 0 ? (
                  confirmClearShelf ? (
                    <>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-9 gap-2 rounded-xl bg-destructive/15 px-3 text-xs font-semibold text-destructive transition-all hover:bg-destructive/25 active:scale-95"
                        onClick={() => {
                          setConfirmClearShelf(false);
                          void handleClearShelf();
                        }}
                      >
                        Sure?
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-9 gap-2 rounded-xl px-3 text-xs text-zinc-400"
                        onClick={() => setConfirmClearShelf(false)}
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
                      onClick={() => setConfirmClearShelf(true)}
                    >
                      <X className="size-4" />
                      Clear
                    </Button>
                  )
                ) : null}
              </div>
            ) : null}
          </div>
          {showExtensionsView || showShelfView ? (
            <p className="mt-1.5 text-sm font-medium text-zinc-400">
              {showExtensionsView
                ? "Optional workflows. Flip one on and it joins the workspace."
                : "Sounds under review."}
            </p>
          ) : null}
        </div>

        {showExtensionsView ? (
          <ExtensionGrid
            extensions={extensions}
            isLoading={isLoadingExtensions}
            onOpenDetails={setSelectedExtension}
            onToggleEnabled={handleToggleExtensionEnabled}
            onRunCommand={handleRunCommand}
            pendingExtensionId={pendingExtensionId}
          />
        ) : (
          <>
            {selectedIds.length > 1 ? (
              <div className="px-4 pt-3 md:px-5">
                <SelectionBulkBar
                  count={selectedIds.length}
                  tags={tags}
                  soundShelfEnabled={soundShelfEnabled}
                  onSaveAll={() => void handleBulkSaveAll()}
                  onAddToQueue={handleBulkAddToQueue}
                  onAddToShelf={() => void handleBulkAddToShelf()}
                    onTag={(tagId) => void handleBulkTag(tagId)}
                    onRemove={() => setConfirmBulkRemove({ stage: "choose" })}
                    bulkRemove={confirmBulkRemove}
                    removeDefault={removeDefault}
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
                isSelectedFilePlaying={isPlayerPlaying}
                onSelect={handleSelectFile}
                onToggleFavorite={handleToggleFavorite}
                searchQuery={debouncedSearchQuery}
                isLoading={isLoadingFiles}
                soundShelfEnabled={soundShelfEnabled}
                makePackEnabled={makePackEnabled}
                onMakePackFile={handleMakePackFile}
                folderJanitorEnabled={folderJanitorEnabled}
                onScanFolder={handleScanFolder}
                allTags={tags}
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
        onClose={handleClosePlayer}
        onPlaybackChange={setIsPlayerPlaying}
        onEnded={handleTrackEnded}
        onNext={handleStepNext}
        onPrev={handleStepPrev}
        autoplay={autoplay}
        onToggleAutoplay={handleToggleAutoplay}
        nextTitle={nextTitle}
        onToggleFavorite={handleToggleFavorite}
        collections={collections}
        onAddToCollection={handleAddToCollection}
        onCreateCollection={() => setShowSettings(true)}
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
        open={showSettings}
        onOpenChange={setShowSettings}
        settings={settings}
        onSaveRoot={handleSaveRoot}
        onRemoveRoot={handleRemoveRoot}
        scanStatus={scanStatus}
        onStartScan={handleStartScan}
        collections={collections}
        tags={tags}
        onCreateCollection={handleCreateCollection}
        onDeleteCollection={handleDeleteCollection}
        onRenameCollection={(id, name) => setRenamingCollection({ id, name })}
        onConvertToRegularCollection={handleConvertToRegularCollection}
        onCreateTag={handleCreateTag}
        onDeleteTag={handleDeleteTag}
        extensions={extensions}
        onToggleExtension={handleToggleExtensionEnabled}
        onUpdateExtensionSetting={handleUpdateExtensionSetting}
        zoom={zoom}
        onUpdateZoom={handleUpdateZoom}
        shortcutBindings={shortcutBindings}
        onRebindShortcut={handleRebindShortcut}
        onResetShortcuts={handleResetShortcuts}
        removeDefault={removeDefault}
        onRemoveDefaultChange={handleRemoveDefaultChange}
      />

      <OnboardingDialog
        open={showOnboarding}
        onOpenChange={setShowOnboarding}
        onSaveRoot={saveLibraryRoot}
        onStartScan={startLibraryScan}
        onComplete={handleCompleteOnboarding}
      />

      <Dialog
        open={selectedExtension !== null}
        onOpenChange={handleCloseExtensionDetails}
      >
        <DialogContent className="max-w-lg rounded-2xl border border-white/10 bg-shell/95 p-6 backdrop-blur-2xl">
          <DialogTitle className="text-lg font-extrabold tracking-tight text-zinc-50">
            {selectedExtension?.name ?? "Extension details"}
          </DialogTitle>
          {selectedExtension ? (
            <div className="space-y-5 text-sm">
              <div className="space-y-1">
                <p className="text-zinc-400">
                  {selectedExtension.description}
                </p>
                <p className="font-mono text-xs text-zinc-500">
                  {selectedExtension.provider} · v{selectedExtension.version}
                </p>
              </div>

              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-zinc-200">Commands</h3>
                {selectedExtension.commands?.length ? (
                  <div className="flex flex-wrap gap-2">
                    {selectedExtension.commands.map((command) => (
                      <button
                        key={command.id}
                        type="button"
                        onClick={() => {
                          setSelectedExtension(null);
                          handleRunCommand(
                            selectedExtension.id,
                            command.id,
                          );
                        }}
                        className="rounded-full border border-white/10 bg-white/5 px-2 py-1 font-mono text-xs text-zinc-300 ring-1 ring-white/10 transition-colors hover:border-accent-fill/50 hover:bg-accent-fill/10 hover:text-accent-text hover:ring-accent-fill/30"
                        title={`Run: ${command.title}`}
                      >
                        {command.title}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-zinc-500">
                    No commands exposed.
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-zinc-200">Permissions</h3>
                {selectedExtension.permissions?.length ? (
                  <div className="flex flex-wrap gap-2">
                    {selectedExtension.permissions.map((permission) => (
                      <span
                        key={permission}
                        className="rounded-full border border-white/10 bg-white/5 px-2 py-1 font-mono text-xs text-zinc-400 ring-1 ring-white/10"
                      >
                        {permission}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-zinc-500">
                    No permissions declared.
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-zinc-200">Surfaces</h3>
                {selectedExtension.surfaces?.length ? (
                  <div className="flex flex-wrap gap-2">
                    {selectedExtension.surfaces.map((surface) => (
                      <span
                        key={surface}
                        className="rounded-full border border-white/10 bg-white/5 px-2 py-1 font-mono text-xs text-zinc-400 ring-1 ring-white/10"
                      >
                        {surface}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-zinc-500">
                    No UI surfaces declared.
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-zinc-200">Settings</h3>
                {selectedExtension.settingsCount ? (
                  <p className="text-xs text-zinc-500">
                    This extension exposes {selectedExtension.settingsCount} configurable settings.
                  </p>
                ) : (
                  <p className="text-xs text-zinc-500">
                    This extension has no configurable settings yet.
                  </p>
                )}
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <FolderJanitorDialog
        open={folderJanitorOpen}
        onOpenChange={setFolderJanitorOpen}
        initialTarget={folderJanitorTarget}
        initialFolderPath={
          folderJanitorTarget === "folder" ? folderJanitorFolderPath : undefined
        }
      />

      <LibraryGathererDialog
        open={gatherOpen}
        onOpenChange={handleCloseGather}
      />

      <MakePackDialog
        open={packSource !== null}
        onOpenChange={handleClosePack}
        initialSource={packSource ?? "selection"}
        initialFileIds={packFileIds}
        initialOutputFormat={makePackDefaultFormat}
      />

      <RenameHammerDialog
        open={renameHammerOpen}
        onOpenChange={setRenameHammerOpen}
      />

      <Dialog open={showSaveSearch} onOpenChange={setShowSaveSearch}>
        <DialogContent className="max-w-sm rounded-2xl border border-white/10 bg-shell/95 p-6 backdrop-blur-2xl">
          <DialogTitle className="text-lg font-extrabold tracking-tight text-zinc-50">Save Search</DialogTitle>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              const name = data.get("name") as string;
              if (name.trim()) handleSaveSearch(name.trim());
            }}
            className="mt-4 space-y-4"
          >
            <Input
              name="name"
              placeholder="Collection name..."
              autoFocus
              className="rounded-xl border-white/10 bg-black/30"
            />
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setShowSaveSearch(false)}
              >
                Cancel
              </Button>
              <Button type="submit">
                <Save className="size-4" />
                Save
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={renamingCollection !== null} onOpenChange={(open) => { if (!open) setRenamingCollection(null); }}>
        <DialogContent className="max-w-sm rounded-2xl border border-white/10 bg-shell/95 p-6 backdrop-blur-2xl">
          <DialogTitle className="text-lg font-extrabold tracking-tight text-zinc-50">Rename Collection</DialogTitle>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              const name = data.get("name") as string;
              if (name.trim() && renamingCollection) {
                handleRenameCollection(renamingCollection.id, name.trim());
                setRenamingCollection(null);
              }
            }}
            className="mt-4 space-y-4"
          >
            <Input
              key={renamingCollection?.id ?? "new"}
              name="name"
              defaultValue={renamingCollection?.name ?? ""}
              placeholder="Collection name..."
              autoFocus
              className="rounded-xl border-white/10 bg-black/30"
            />
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setRenamingCollection(null)}
              >
                Cancel
              </Button>
              <Button type="submit">
                Save
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
