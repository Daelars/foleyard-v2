"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bug, FileInput, Loader2, PackagePlus, PanelLeft, Save, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { AudioPlayer, type AudioPlayerRef } from "@/components/AudioPlayer";
import { DesktopTitleBar } from "@/components/DesktopTitleBar";
import { ExtensionGrid, type ExtensionGridItem } from "@/components/ExtensionGrid";
import { FolderJanitorDialog } from "@/components/extensions/folder-janitor/FolderJanitorDialog";
import { LibraryGathererDialog } from "@/components/extensions/library-gatherer/LibraryGathererDialog";
import { MakePackDialog } from "@/components/extensions/make-pack/MakePackDialog";
import { OnboardingDialog } from "@/components/OnboardingDialog";
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
import { interpretExtensionUiIntent } from "@/lib/extensions/ui-intent";
import { isDesktopApp } from "@/lib/desktop";
import { cn } from "@/lib/utils";
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
  useEffect(() => { filesRef.current = files; }, [files]);
  useEffect(() => { tagsRef.current = tags; }, [tags]);

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
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; name: string } | null>(null);
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
    const collection = collections.find((c) => c.id === collectionId);
    if (collection?.isSmart && collection.filter) {
      try {
        const filter = JSON.parse(collection.filter) as { q?: string };
        setSearchQuery(filter.q ?? "");
        setCurrentView("all");
        setSelectedCollection(collectionId);
        setSelectedDirectory(null);
        return;
      } catch {
        // Invalid filter JSON, fall through to regular view
      }
    }
    setCurrentView("collection");
    setSelectedCollection(collectionId);
    setSelectedDirectory(null);
    setSearchQuery("");
  }, [collections]);

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
    } catch {
      toast.error("Failed to update favorite status");
    }
  }, []);

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
      toast.success("Converted to playlist");
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
      toast.success("Playlist created");
    } catch {
      toast.error("Failed to create playlist");
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
  }, [collections, selectedCollection]);

  const handleDeleteCollection = useCallback(async (collectionId: string) => {
    const collection = collections.find((c) => c.id === collectionId);
    if (collection?.isSmart) {
      setConfirmDelete({ id: collectionId, name: collection.name });
      return;
    }
    await executeDeleteCollection(collectionId);
  }, [collections, executeDeleteCollection]);

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
    smartCollectionsEnabled,
    viewingSmartCollection,
    activeSmartCollectionId,
  } = useMemo(() => {
    const shelf = extensions.find((e) => e.id === "sound-shelf")?.enabled ?? false;
    const pack = extensions.find((e) => e.id === "make-pack")?.enabled ?? false;
    const janitor = extensions.find((e) => e.id === "folder-janitor")?.enabled ?? false;
    const gatherer = extensions.find((e) => e.id === "library-gatherer")?.enabled ?? false;
    const smart = extensions.find((e) => e.id === "smart-collections")?.enabled ?? false;
    const activeSmart = selectedCollection
      ? collections.find((c) => c.id === selectedCollection && c.isSmart) ?? null
      : null;
    return {
      soundShelfEnabled: shelf,
      makePackEnabled: pack,
      showSoundShelf: shelf && soundShelfItemCount > 0,
      folderJanitorEnabled: janitor,
      libraryGathererEnabled: gatherer,
      smartCollectionsEnabled: smart,
      viewingSmartCollection: activeSmart !== null,
      activeSmartCollectionId: activeSmart?.id ?? null,
    };
  }, [extensions, soundShelfItemCount, selectedCollection, collections]);

  const handleOpenMobileSidebar = useCallback(() => setShowMobileSidebar(true), []);
  const handleCloseMobileSidebar = useCallback(() => setShowMobileSidebar(false), []);
  const handleOpenSettings = useCallback(() => setShowSettings(true), []);

  const makePackDefaultFormat = useMemo(() => {
    const value = extensions
      .find((e) => e.id === "make-pack")
      ?.settings?.find((s) => s.id === "default-format")?.value;
    return value === "zip" || value === "folder" ? value : "zip";
  }, [extensions]);

  const handleRecentPack = useCallback(() => {
    void executeHostedCommand("make-pack", "make-pack.from-recent");
  }, [executeHostedCommand]);

  const handleOpenScan = useCallback(() => {
    void executeHostedCommand(
      "folder-janitor",
      "folder-janitor.scan-library",
    );
  }, [executeHostedCommand]);

  const handleOpenGather = useCallback(() => {
    void executeHostedCommand(
      "library-gatherer",
      "library-gatherer.gather",
    );
  }, [executeHostedCommand]);

  const handleSelectFile = useCallback((file: FileRecord) => {
    if (selectedFileRef.current?.id === file.id) {
      audioPlayerRef.current?.togglePlayback();
    } else {
      setSelectedFile(file);
    }
  }, []);

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

  const handleShelfSelectFile = useCallback((fileId: string) => {
    const match = filesRef.current.find((f) => f.id === fileId);
    if (match) setSelectedFile(match);
  }, []);

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
    <div className="relative flex h-full overflow-hidden bg-background font-sans">
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
        onRenameCollection={(id, name) => setRenamingCollection({ id, name })}
        onConvertToRegularCollection={handleConvertToRegularCollection}
        onDeleteCollection={handleDeleteCollection}
      />

      <Dialog open={showMobileSidebar} onOpenChange={setShowMobileSidebar}>
        <DialogContent
          showCloseButton={false}
          className="left-0 top-0 h-full w-[calc(100%-3rem)] max-w-80 translate-x-0 translate-y-0 rounded-none border-r border-border/40 bg-card/80 p-0 shadow-2xl backdrop-blur-2xl duration-300 ease-out data-open:slide-in-from-left-8 data-open:fade-in-0 data-closed:slide-out-to-left-8 data-closed:fade-out-0 sm:max-w-80"
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
            onRenameCollection={(id, name) => setRenamingCollection({ id, name })}
            onConvertToRegularCollection={handleConvertToRegularCollection}
            onDeleteCollection={handleDeleteCollection}
            onAction={handleCloseMobileSidebar}
          />
        </DialogContent>
      </Dialog>

      <main className="relative flex min-w-0 flex-1 flex-col bg-background/40 backdrop-blur-md">
        <DesktopTitleBar />

        <header className="shrink-0 border-b border-white/5 px-4 py-3 md:px-5">
          <div className="flex h-10 items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              className="size-10 rounded-xl border-white/10 bg-white/5 duration-200 animate-in fade-in-0 zoom-in-95 hover:border-accent-fill/50 md:hidden"
              onClick={handleOpenMobileSidebar}
              aria-label="Open navigation menu"
            >
              <PanelLeft className="size-4" />
            </Button>

            {!showExtensionsView && (
              <div className="relative flex flex-1 items-center gap-2 duration-300 animate-in fade-in-0 slide-in-from-top-2 md:max-w-xl">
                <div className="relative flex-1">
                  <Search className="pointer-events-none absolute left-3.5 top-1/2 z-10 size-4 -translate-y-1/2 text-zinc-500" />
                  <Input
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Search library..."
                    className="h-10 rounded-xl border-white/10 bg-white/[0.04] pl-10 pr-4 text-sm font-medium leading-5 text-zinc-50 shadow-none backdrop-blur-none placeholder:font-normal placeholder:text-zinc-600 focus-visible:border-accent-fill/60 focus-visible:bg-white/[0.06] focus-visible:ring-0 focus-visible:ring-offset-0"
                  />
                </div>
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
              </div>
            )}

            {isLoadingFiles && (
              <Loader2 className="size-4 animate-spin text-accent-text" />
            )}

            {!showExtensionsView && makePackEnabled && (
              <Button
                variant="outline"
                size="sm"
                className="hidden h-10 gap-2 rounded-xl border-white/10 bg-white/5 text-xs text-zinc-400 shadow-none backdrop-blur-none hover:border-accent-fill/50 hover:bg-white/[0.07] hover:text-zinc-100 sm:inline-flex"
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
                className="hidden h-10 gap-2 rounded-xl border-white/10 bg-white/5 text-xs text-zinc-400 shadow-none backdrop-blur-none hover:border-accent-fill/50 hover:bg-white/[0.07] hover:text-zinc-100 sm:inline-flex"
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
                className="hidden h-10 gap-2 rounded-xl border-white/10 bg-white/5 text-xs text-zinc-400 shadow-none backdrop-blur-none hover:border-accent-fill/50 hover:bg-white/[0.07] hover:text-zinc-100 sm:inline-flex"
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
                allTags={tags}
                onToggleFileTag={handleToggleFileTag}
              />
            </div>

            {showSoundShelf ? (
              <aside className="hidden w-80 shrink-0 border-l border-white/10 lg:flex lg:flex-col">
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
        allTags={tags}
        onToggleFileTag={handleToggleFileTag}
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
        onCreateTag={handleCreateTag}
        onDeleteTag={handleDeleteTag}
        extensions={extensions}
        onToggleExtension={handleToggleExtensionEnabled}
        onUpdateExtensionSetting={handleUpdateExtensionSetting}
        zoom={zoom}
        onUpdateZoom={handleUpdateZoom}
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
        <DialogContent className="max-w-sm rounded-2xl border border-border/40 bg-card/95 p-6 backdrop-blur-2xl">
          <DialogTitle className="text-lg font-semibold">Save Search</DialogTitle>
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
              className="rounded-xl border-border/40 bg-muted/50"
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

      <Dialog open={confirmDelete !== null} onOpenChange={(open) => { if (!open) setConfirmDelete(null); }}>
        <DialogContent className="max-w-sm rounded-2xl border border-border/40 bg-card/95 p-6 backdrop-blur-2xl">
          <DialogTitle className="text-lg font-semibold">Delete Smart Collection</DialogTitle>
          <p className="mt-2 text-sm text-muted-foreground">
            Delete smart collection &ldquo;{confirmDelete?.name}&rdquo;? This cannot be undone.
          </p>
          <div className="mt-6 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirmDelete(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (confirmDelete) executeDeleteCollection(confirmDelete.id);
                setConfirmDelete(null);
              }}
            >
              <Trash2 className="mr-2 size-4" />
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={renamingCollection !== null} onOpenChange={(open) => { if (!open) setRenamingCollection(null); }}>
        <DialogContent className="max-w-sm rounded-2xl border border-border/40 bg-card/95 p-6 backdrop-blur-2xl">
          <DialogTitle className="text-lg font-semibold">Rename Collection</DialogTitle>
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
              className="rounded-xl border-border/40 bg-muted/50"
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
