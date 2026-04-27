"use client";

import { useCallback, useDeferredValue, useEffect, useRef, useState } from "react";
import { Search, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Sidebar } from "@/components/Sidebar";
import { FileTable } from "@/components/FileTable";
import { AudioPlayer } from "@/components/AudioPlayer";
import { SettingsDialog } from "@/components/SettingsDialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

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
  added: number;
  updated: number;
  removed: number;
  failed: number;
  error: string | null;
}

const emptyScanStatus: ScanStatus = {
  running: false,
  phase: "idle",
  discovered: 0,
  added: 0,
  updated: 0,
  removed: 0,
  failed: 0,
  error: null,
};

import { AudioPlayerProvider } from "@/components/ui/audio-player";

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
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const [currentView, setCurrentView] = useState<"all" | "favorites" | "collection" | "directory">("all");
  const [selectedCollection, setSelectedCollection] = useState<string | null>(null);
  const [selectedDirectory, setSelectedDirectory] = useState<string | null>(null);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState({
    libraryRoot: null,
    stats: { activeFiles: 0, removedFiles: 0 },
  });
  const [scanStatus, setScanStatus] = useState<ScanStatus>(emptyScanStatus);

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

  const loadFiles = useCallback(async () => {
    setIsLoadingFiles(true);
    const params = new URLSearchParams();
    if (deferredSearchQuery.trim()) {
      params.set("q", deferredSearchQuery.trim());
    } else {
      // Only filter by directory if not searching
      if (currentView === "directory" && selectedDirectory) {
        params.set("directory", selectedDirectory);
      } else if (currentView === "all") {
        // In "all" view without search, if we have a selectedDirectory, show its files
        if (selectedDirectory) {
          params.set("directory", selectedDirectory);
        } else {
          setFiles([]);
          setIsLoadingFiles(false);
          return;
        }
      }
    }
    
    if (currentView === "favorites") params.set("favorites", "true");
    if (currentView === "collection" && selectedCollection) params.set("collectionId", selectedCollection);
    
    try {
      const response = await fetch(`/api/files?${params.toString()}`);
      if (!response.ok) throw new Error("Failed to fetch files");
      const data = await response.json();
      setFiles(data.files ?? []);
    } catch (err) {
      toast.error("Failed to load library");
    } finally {
      setIsLoadingFiles(false);
    }
  }, [currentView, deferredSearchQuery, selectedCollection, selectedDirectory]);

  const loadDirectories = useCallback(async () => {
    // Only load directories if we're not searching
    if (deferredSearchQuery.trim() || currentView === "favorites" || currentView === "collection") {
      setDirectories([]);
      return;
    }

    try {
      const params = new URLSearchParams();
      if (selectedDirectory) params.set("parent", selectedDirectory);
      const res = await fetch(`/api/directories?${params.toString()}`);
      const data = await res.json();
      setDirectories(data.directories ?? []);
    } catch (err) {
      console.error("Failed to load directories:", err);
    }
  }, [deferredSearchQuery, currentView, selectedDirectory]);

  const loadInitialData = useCallback(async () => {
    try {
      const [settingsRes, collectionsRes, tagsRes, scanRes] = await Promise.all([
        fetch("/api/settings"),
        fetch("/api/collections"),
        fetch("/api/tags"),
        fetch("/api/scan")
      ]);
      
      const [settingsData, collectionsData, tagsData, scanData] = await Promise.all([
        settingsRes.json(),
        collectionsRes.json(),
        tagsRes.json(),
        scanRes.json()
      ]);

      setSettings(settingsData);
      setCollections(collectionsData.collections ?? []);
      setTags(tagsData.tags ?? []);
      setScanStatus(scanData);
    } catch (err) {
      toast.error("Failed to sync with server");
    }
  }, []);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  useEffect(() => {
    loadFiles();
    loadDirectories();
  }, [loadFiles, loadDirectories]);

  const handleToggleFavorite = async (id: string) => {
    try {
      const res = await fetch("/api/files", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action: "toggleFavorite" }),
      });
      if (!res.ok) throw new Error();
      
      // Optimistic update
      setFiles(prev => prev.map(f => f.id === id ? { ...f, isFavorite: !f.isFavorite } : f));
      if (selectedFile?.id === id) {
        setSelectedFile({ ...selectedFile, isFavorite: !selectedFile.isFavorite });
      }
    } catch (e) {
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

      setSettings({ libraryRoot: data.libraryRoot, stats: data.stats });
      setScanStatus((current) => ({
        ...current,
        libraryRoot: data.libraryRoot,
        stats: data.stats,
      }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save settings");
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
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to start scan");
    }
  };

  const handleCreateCollection = async (name: string) => {
    if (!name.trim()) return;
    try {
      const res = await fetch("/api/collections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (!res.ok) throw new Error();
      loadInitialData();
      toast.success("Playlist created");
    } catch (e) {
      toast.error("Failed to create playlist");
    }
  };

  const handleDeleteCollection = async (collectionId: string) => {
    try {
      const res = await fetch("/api/collections", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ collectionId }),
      });
      if (!res.ok) throw new Error();

      if (selectedCollection === collectionId) {
        setSelectedCollection(null);
        setCurrentView("all");
      }

      loadInitialData();
      toast.success("Playlist deleted");
    } catch (e) {
      toast.error("Failed to delete playlist");
    }
  };

  const handleCreateTag = async (name: string) => {
    if (!name.trim()) return;
    try {
      await fetch("/api/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      loadInitialData();
      toast.success("Tag created");
    } catch (e) {
      toast.error("Failed to create tag");
    }
  };

  const handleAddToCollection = async (collectionId: string) => {
    if (!selectedFile) return;
    const playlist = collections.find((collection) => collection.id === collectionId);

    try {
      const res = await fetch("/api/collections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileId: selectedFile.id,
          collectionId,
        }),
      });
      if (!res.ok) throw new Error();

      await loadInitialData();
      toast.success(`Added to ${playlist?.name ?? "playlist"}`);
    } catch (e) {
      toast.error("Failed to add to playlist");
    }
  };

  // Poll scan status
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (scanStatus.running) {
      interval = setInterval(async () => {
        const res = await fetch("/api/scan");
        const data = await res.json();
        setScanStatus(data);
        if (!data.running) {
          loadFiles();
          loadInitialData();
          toast.success("Scan complete");
        }
      }, 2000);
    }
    return () => clearInterval(interval);
  }, [scanStatus.running, loadFiles, loadInitialData]);

  const selectedPlaylistName =
    currentView === "collection"
      ? collections.find((collection) => collection.id === selectedCollection)?.name ?? null
      : null;

  return (
    <div className="flex h-screen bg-background overflow-hidden font-sans">
      <Sidebar
        currentView={currentView}
        collections={collections}
        selectedCollection={selectedCollection}
        tags={tags}
        scanStatus={scanStatus}
        onOpenSettings={() => setShowSettings(true)}
        onSelectLibrary={showLibrary}
        onSelectFavorites={showFavorites}
        onSelectCollection={showCollection}
      />

      <main className="flex-1 flex flex-col min-w-0 bg-background/50">
        <header className="h-16 shrink-0 border-b border-border flex items-center px-6 gap-4">
          <div className="relative flex-1 max-w-xl">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search library..."
              className="pl-9 h-10 bg-muted/30 border-none focus-visible:ring-1 focus-visible:ring-primary/50"
            />
          </div>
          <div className="flex items-center gap-4 text-xs font-medium text-muted-foreground">
             {isLoadingFiles ? (
               <Loader2 className="size-4 animate-spin text-primary" />
             ) : (
               <span>{files.length} Sounds Found</span>
             )}
          </div>
        </header>

        <FileTable
          files={files}
          directories={directories}
          currentDirectory={selectedDirectory}
          currentPlaylistName={selectedPlaylistName}
          onNavigate={navigateDirectory}
          onNavigateLibrary={showLibrary}
          selectedFileId={selectedFile?.id ?? null}
          onSelect={(file) => setSelectedFile(file)}
          onToggleFavorite={handleToggleFavorite}
          searchQuery={deferredSearchQuery}
          isLoading={isLoadingFiles}
        />
        <div className={cn("h-0 transition-all duration-300", selectedFile && "h-28")} />
      </main>

      <AudioPlayer
        selectedFile={selectedFile}
        onClose={() => setSelectedFile(null)}
        onToggleFavorite={handleToggleFavorite}
        collections={collections}
        onAddToCollection={handleAddToCollection}
      />

      <SettingsDialog
        open={showSettings}
        onOpenChange={setShowSettings}
        settings={settings}
        onSaveRoot={handleSaveRoot}
        scanStatus={scanStatus}
        onStartScan={handleStartScan}
        collections={collections}
        tags={tags}
        onCreateCollection={handleCreateCollection}
        onDeleteCollection={handleDeleteCollection}
        onCreateTag={handleCreateTag}
      />
    </div>
  );
}
