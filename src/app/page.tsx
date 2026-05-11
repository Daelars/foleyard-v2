"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bug, FileInput, Loader2, PackagePlus, PanelLeft, Search } from "lucide-react";
import { toast } from "sonner";

import { AudioPlayer, type AudioPlayerRef } from "@/components/AudioPlayer";
import { DesktopTitleBar } from "@/components/DesktopTitleBar";
import { ExtensionGrid, type ExtensionGridItem } from "@/components/ExtensionGrid";
import { FolderJanitorDialog } from "@/components/extensions/folder-janitor/FolderJanitorDialog";
import { LibraryGathererDialog } from "@/components/extensions/library-gatherer/LibraryGathererDialog";
import { MakePackDialog } from "@/components/extensions/make-pack/MakePackDialog";
import { RenameHammerDialog } from "@/components/extensions/rename-hammer/RenameHammerDialog";
import { FileTable } from "@/components/FileTable";
import { SettingsDialog } from "@/components/SettingsDialog";
import { Sidebar } from "@/components/Sidebar";
import { SoundShelf } from "@/components/SoundShelf";
import { AudioPlayerProvider } from "@/components/ui/audio-player";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { SOUND_SHELF_CHANGED_EVENT } from "@/lib/extensions/sound-shelf-events";
import { isDesktopApp } from "@/lib/desktop";
import { cn } from "@/lib/utils";
import { useZoom } from "@/hooks/use-zoom";
import { useScanPolling } from "@/hooks/use-scan-polling";

interface FileRecord {
  id: string;
  filename: string;
  path: string;
  directory: string | null;
  format: string | null;
  duration: number | null;
  fileSize: number | null;
  isFavorite: boolean;
}

interface CollectionRecord {
  id: string;
  name: string;
  fileCount?: number;
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
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [currentView, setCurrentView] = useState<
    "all" | "favorites" | "extensions" | "collection" | "directory"
  >("all");
  const [selectedCollection, setSelectedCollection] = useState<string | null>(
    null,
  );
  const [selectedDirectory, setSelectedDirectory] = useState<string | null>(
    null,
  );
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [isPlayerPlaying, setIsPlayerPlaying] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showMobileSidebar, setShowMobileSidebar] = useState(false);
  const [settings, setSettings] = useState<{
    libraryRoot: string | null;
    libraryRoots: string[];
    stats: { activeFiles: number; removedFiles: number };
  }>({
    libraryRoot: null,
    libraryRoots: [],
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
    setSearchQuery("");
  }, []);

  const showFavorites = useCallback(() => {
    setCurrentView("favorites");
    setSelectedCollection(null);
    setSelectedDirectory(null);
    setSearchQuery("");
  }, []);

  const showExtensions = useCallback(() => {
    setCurrentView("extensions");
    setSelectedCollection(null);
    setSelectedDirectory(null);
    setSelectedFile(null);
    setSearchQuery("");
  }, []);

  const showCollection = useCallback((collectionId: string) => {
    setCurrentView("collection");
    setSelectedCollection(collectionId);
    setSelectedDirectory(null);
    setSearchQuery("");
  }, []);

  const navigateDirectory = useCallback((directory: string | null) => {
    setCurrentView(directory ? "directory" : "all");
    setSelectedCollection(null);
    setSelectedDirectory(directory);
  }, []);

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

    try {
      const response = await fetch(`/api/files?${params.toString()}`);
      if (!response.ok) {
        throw new Error("Failed to fetch files");
      }

      const data = await response.json();
      if (filesRequestIdRef.current === requestId) {
        setFiles(data.files ?? []);
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
  }, [currentView, debouncedSearchQuery, selectedCollection, selectedDirectory]);

  const loadDirectories = useCallback(async () => {
    const requestId = directoriesRequestIdRef.current + 1;
    directoriesRequestIdRef.current = requestId;

    if (
      debouncedSearchQuery.trim() ||
      currentView === "favorites" ||
      currentView === "collection" ||
      currentView === "extensions"
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
  }, [debouncedSearchQuery, currentView, selectedDirectory]);

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

      setSettings({
        ...settingsData,
        libraryRoots:
          settingsData.libraryRoots ??
          (settingsData.libraryRoot ? [settingsData.libraryRoot] : []),
      });
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

  useEffect(() => {
    const handleSoundShelfChanged = () => {
      void loadSoundShelfCount();
    };

    window.addEventListener(SOUND_SHELF_CHANGED_EVENT, handleSoundShelfChanged);
    return () => {
      window.removeEventListener(
        SOUND_SHELF_CHANGED_EVENT,
        handleSoundShelfChanged,
      );
    };
  }, [loadSoundShelfCount]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void Promise.all([loadFiles(), loadDirectories()]);
    }, 0);

    return () => {
      window.clearTimeout(timer);
    };
  }, [loadFiles, loadDirectories]);

  const handleToggleFavorite = async (id: string) => {
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

      if (selectedFile?.id === id) {
        setSelectedFile({
          ...selectedFile,
          isFavorite: !selectedFile.isFavorite,
        });
      }
    } catch {
      toast.error("Failed to update favorite status");
    }
  };

  const handleSaveRoot = async (path: string) => {
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
        stats: data.stats,
      });
      setScanStatus((current) => ({
        ...current,
        libraryRoot: data.libraryRoot,
        stats: data.stats,
      }));
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to save settings",
      );
    }
  };

  const handleStartScan = async () => {
    try {
      const res = await fetch("/api/scan", { method: "POST" });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error ?? "Failed to start scan");
      }

      setScanStatus(data.status);
      toast.info("Scan started");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to start scan",
      );
    }
  };

  const handleCreateCollection = async (name: string) => {
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
      toast.success("Playlist created");
    } catch {
      toast.error("Failed to create playlist");
    }
  };

  const handleDeleteCollection = async (collectionId: string) => {
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

      toast.success("Playlist deleted");
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
      toast.error("Failed to delete playlist");
    }
  };

  const handleRemoveRoot = async (path: string) => {
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
  };

  const handleCreateTag = async (name: string) => {
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
  };

  const handleDeleteTag = async (tagId: string) => {
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
  };

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

  const handleAddToCollection = async (collectionId: string) => {
    if (!selectedFile) {
      return;
    }

    const playlist = collections.find(
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
      toast.success(`Added to ${playlist?.name ?? "playlist"}`);
    } catch {
      toast.error("Failed to add to playlist");
    }
  };

  const handleMakePack = useCallback(
    async (
      source: "selection" | "shelf" | "recent",
      fileIds: string[] = [],
    ) => {
      if (source === "shelf" && !isDesktopApp()) {
        toast.error("Make Pack needs the desktop app to choose an output folder");
        return;
      }
      setPackSource(source);
      setPackFileIds(fileIds);
    },
    [],
  );

  const handleScanFolder = useCallback((folderPath: string) => {
    setFolderJanitorTarget("folder");
    setFolderJanitorFolderPath(folderPath);
    setFolderJanitorOpen(true);
  }, []);

  const handleRunCommand = useCallback(
    (extensionId: string, commandId: string) => {
      switch (commandId) {
        case "folder-janitor.scan-library":
          setFolderJanitorTarget("library");
          setFolderJanitorOpen(true);
          break;
        case "library-gatherer.preview-gather":
        case "library-gatherer.gather":
          setGatherOpen(true);
          break;
        case "sound-shelf.clear":
          void fetch("/api/extensions/sound-shelf/clear", {
            method: "POST",
          }).then(() => {
            window.dispatchEvent(
              new CustomEvent(SOUND_SHELF_CHANGED_EVENT),
            );
          });
          break;
        case "make-pack.from-shelf":
          setCurrentView("all");
          setPackSource("shelf");
          setPackFileIds([]);
          break;
        case "make-pack.from-recent":
          setCurrentView("all");
          setPackSource("recent");
          setPackFileIds([]);
          break;
        case "rename-hammer.open":
          setRenameHammerOpen(true);
          break;
        case "drop-rules.prepare-drag":
          setCurrentView("all");
          setShowSettings(true);
          break;
        default:
          toast.info(`Command "${commandId}" has no quick action yet`);
      }
    },
    [],
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

  const selectedPlaylistName = useMemo(() =>
    currentView === "collection"
      ? (collections.find((c) => c.id === selectedCollection)?.name ?? null)
      : null,
  [currentView, collections, selectedCollection]);

  const showExtensionsView = currentView === "extensions";

  const {
    soundShelfEnabled,
    makePackEnabled,
    showSoundShelf,
    folderJanitorEnabled,
    libraryGathererEnabled,
  } = useMemo(() => {
    const shelf = extensions.find((e) => e.id === "sound-shelf")?.enabled ?? false;
    const pack = extensions.find((e) => e.id === "make-pack")?.enabled ?? false;
    const janitor = extensions.find((e) => e.id === "folder-janitor")?.enabled ?? false;
    const gatherer = extensions.find((e) => e.id === "library-gatherer")?.enabled ?? false;
    return {
      soundShelfEnabled: shelf,
      makePackEnabled: pack,
      showSoundShelf: shelf && soundShelfItemCount > 0,
      folderJanitorEnabled: janitor,
      libraryGathererEnabled: gatherer,
    };
  }, [extensions, soundShelfItemCount]);

  const handleOpenMobileSidebar = useCallback(() => setShowMobileSidebar(true), []);
  const handleCloseMobileSidebar = useCallback(() => setShowMobileSidebar(false), []);
  const handleOpenSettings = useCallback(() => setShowSettings(true), []);

  const handleRecentPack = useCallback(() => {
    void handleMakePack("recent");
  }, [handleMakePack]);

  const handleOpenScan = useCallback(() => {
    setFolderJanitorTarget("library");
    setFolderJanitorOpen(true);
  }, []);

  const handleOpenGather = useCallback(() => setGatherOpen(true), []);

  const handleSelectFile = useCallback((file: FileRecord) => {
    if (selectedFile?.id === file.id) {
      audioPlayerRef.current?.togglePlayback();
    } else {
      setSelectedFile(file);
    }
  }, [selectedFile]);

  const handleMakePackFile = useCallback(
    (file: FileRecord) => handleMakePack("selection", [file.id]),
    [handleMakePack],
  );

  const handleMakePackShelf = useCallback(
    () => handleMakePack("shelf"),
    [handleMakePack],
  );

  const handleShelfSelectFile = useCallback((fileId: string) => {
    const match = files.find((f) => f.id === fileId);
    if (match) setSelectedFile(match);
  }, [files]);

  const handleClosePlayer = useCallback(() => {
    setSelectedFile(null);
    setIsPlayerPlaying(false);
  }, []);

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
    <div className="relative flex h-screen overflow-hidden bg-background font-sans">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,color-mix(in_oklab,var(--primary)_10%,transparent),transparent_32%),radial-gradient(circle_at_bottom_right,color-mix(in_oklab,var(--foreground)_5%,transparent),transparent_38%)]" />

      <Sidebar
        className="hidden md:flex"
        currentView={currentView}
        collections={collections}
        selectedCollection={selectedCollection}
        tags={tags}
        scanStatus={scanStatus}
        onOpenSettings={handleOpenSettings}
        onSelectLibrary={showLibrary}
        onSelectFavorites={showFavorites}
        onSelectExtensions={showExtensions}
        onSelectCollection={showCollection}
      />

      <Dialog open={showMobileSidebar} onOpenChange={setShowMobileSidebar}>
        <DialogContent
          showCloseButton={false}
          className="left-0 top-0 h-screen w-[calc(100%-3rem)] max-w-80 translate-x-0 translate-y-0 rounded-none border-r border-border/40 bg-card/80 p-0 shadow-2xl backdrop-blur-2xl duration-300 ease-out data-open:slide-in-from-left-8 data-open:fade-in-0 data-closed:slide-out-to-left-8 data-closed:fade-out-0 sm:max-w-80"
        >
          <DialogTitle className="sr-only">Navigation Menu</DialogTitle>
          <Sidebar
            className="w-full border-r-0"
            currentView={currentView}
            collections={collections}
            selectedCollection={selectedCollection}
            tags={tags}
            scanStatus={scanStatus}
            onOpenSettings={handleOpenSettings}
            onSelectLibrary={showLibrary}
            onSelectFavorites={showFavorites}
            onSelectExtensions={showExtensions}
            onSelectCollection={showCollection}
            onAction={handleCloseMobileSidebar}
          />
        </DialogContent>
      </Dialog>

      <main className="relative flex min-w-0 flex-1 flex-col bg-background/40 backdrop-blur-md">
        <DesktopTitleBar />

        <header className="shrink-0 border-b border-border/40 bg-card/60 px-4 py-3 backdrop-blur-xl md:px-5">
          <div className="flex h-10 items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              className="size-10 rounded-xl border-border/40 bg-card/60 backdrop-blur-xl duration-200 animate-in fade-in-0 zoom-in-95 md:hidden"
              onClick={handleOpenMobileSidebar}
              aria-label="Open navigation menu"
            >
              <PanelLeft className="size-4" />
            </Button>

            {!showExtensionsView && (
              <div className="relative flex-1 duration-300 animate-in fade-in-0 slide-in-from-top-2 md:max-w-xl">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 z-10 size-4 -translate-y-1/2 text-muted-foreground/70" />
                <Input
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search library..."
                  className="h-10 rounded-xl border-border/40 bg-card/60 pl-10 pr-4 text-sm leading-5 shadow-sm backdrop-blur-xl placeholder:text-muted-foreground/65 focus-visible:border-primary/50 focus-visible:ring-0 focus-visible:ring-offset-0"
                />
              </div>
            )}

            {isLoadingFiles && (
              <Loader2 className="size-4 animate-spin text-primary" />
            )}

            {!showExtensionsView && makePackEnabled && (
              <Button
                variant="outline"
                size="sm"
                className="hidden h-10 gap-2 rounded-xl border-border/40 bg-card/60 text-xs shadow-sm backdrop-blur-xl sm:inline-flex"
                onClick={handleRecentPack}
              >
                <PackagePlus className="size-4" />
                Recent Pack
              </Button>
            )}

            {!showExtensionsView && folderJanitorEnabled && (
              <Button
                variant="outline"
                size="sm"
                className="hidden h-10 gap-2 rounded-xl border-border/40 bg-card/60 text-xs shadow-sm backdrop-blur-xl sm:inline-flex"
                onClick={handleOpenScan}
              >
                <Bug className="size-4" />
                Scan for Issues
              </Button>
            )}

            {!showExtensionsView && libraryGathererEnabled && (
              <Button
                variant="outline"
                size="sm"
                className="hidden h-10 gap-2 rounded-xl border-border/40 bg-card/60 text-xs shadow-sm backdrop-blur-xl sm:inline-flex"
                onClick={handleOpenGather}
              >
                <FileInput className="size-4" />
                Gather Library
              </Button>
            )}
          </div>
        </header>

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
          <div className="flex min-h-0 flex-1">
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              <FileTable
                files={files}
                directories={directories}
                currentDirectory={selectedDirectory}
                currentPlaylistName={selectedPlaylistName}
                onNavigate={navigateDirectory}
                onNavigateLibrary={showLibrary}
                selectedFileId={selectedFile?.id ?? null}
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
              />
            </div>

            {showSoundShelf ? (
              <aside className="hidden w-80 shrink-0 border-l border-border/40 bg-card/60 backdrop-blur-xl lg:flex lg:flex-col">
                <SoundShelf
                  makePackEnabled={makePackEnabled}
                  onMakePackShelf={handleMakePackShelf}
                  onItemCountChange={setSoundShelfItemCount}
                  onSelectFile={handleShelfSelectFile}
                />
              </aside>
            ) : null}
          </div>
        )}

        <div
          className={cn("h-0 transition-all duration-300", selectedFile && "h-28")}
        />
      </main>

      <AudioPlayer
        ref={audioPlayerRef}
        selectedFile={selectedFile}
        onClose={handleClosePlayer}
        onPlaybackChange={setIsPlayerPlaying}
        onToggleFavorite={handleToggleFavorite}
        collections={collections}
        onAddToCollection={handleAddToCollection}
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
        onCreateTag={handleCreateTag}
        onDeleteTag={handleDeleteTag}
        extensions={extensions}
        onToggleExtension={handleToggleExtensionEnabled}
        onUpdateExtensionSetting={handleUpdateExtensionSetting}
        zoom={zoom}
        onUpdateZoom={handleUpdateZoom}
      />

      <Dialog
        open={selectedExtension !== null}
        onOpenChange={handleCloseExtensionDetails}
      >
        <DialogContent className="max-w-lg rounded-2xl border border-border/40 bg-card/95 p-6 backdrop-blur-2xl">
          <DialogTitle>
            {selectedExtension?.name ?? "Extension details"}
          </DialogTitle>
          {selectedExtension ? (
            <div className="space-y-5 text-sm">
              <div className="space-y-1">
                <p className="text-muted-foreground">
                  {selectedExtension.description}
                </p>
                <p className="text-xs text-muted-foreground">
                  {selectedExtension.provider} · v{selectedExtension.version}
                </p>
              </div>

              <div className="space-y-2">
                <h3 className="text-sm font-medium">Commands</h3>
                {selectedExtension.commands?.length ? (
                  <div className="flex flex-wrap gap-2">
                    {selectedExtension.commands.map((command) => (
                      <button
                        key={command}
                        type="button"
                        onClick={() => {
                          setSelectedExtension(null);
                          handleRunCommand(
                            selectedExtension.id,
                            command,
                          );
                        }}
                        className="rounded-full border border-border/40 bg-muted/50 px-2 py-1 text-xs text-muted-foreground ring-1 ring-border/50 transition-colors hover:bg-primary/10 hover:text-primary hover:ring-primary/30"
                        title={`Run: ${command}`}
                      >
                        {command}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    No commands exposed.
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <h3 className="text-sm font-medium">Permissions</h3>
                {selectedExtension.permissions?.length ? (
                  <div className="flex flex-wrap gap-2">
                    {selectedExtension.permissions.map((permission) => (
                      <span
                        key={permission}
                        className="rounded-full border border-border/40 bg-muted/50 px-2 py-1 text-xs text-muted-foreground ring-1 ring-border/50"
                      >
                        {permission}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    No permissions declared.
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <h3 className="text-sm font-medium">Surfaces</h3>
                {selectedExtension.surfaces?.length ? (
                  <div className="flex flex-wrap gap-2">
                    {selectedExtension.surfaces.map((surface) => (
                      <span
                        key={surface}
                        className="rounded-full border border-border/40 bg-muted/50 px-2 py-1 text-xs text-muted-foreground ring-1 ring-border/50"
                      >
                        {surface}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    No UI surfaces declared.
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <h3 className="text-sm font-medium">Settings</h3>
                {selectedExtension.settingsCount ? (
                  <p className="text-xs text-muted-foreground">
                    This extension exposes {selectedExtension.settingsCount} configurable settings.
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
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
      />

      <RenameHammerDialog
        open={renameHammerOpen}
        onOpenChange={setRenameHammerOpen}
      />
    </div>
  );
}
