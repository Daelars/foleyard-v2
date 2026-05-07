"use client";

import { useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Database,
  ListMusic,
  FolderOpen,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Tag as TagIcon,
  Trash2,
  Activity,
  Layers,
  Monitor,
  Info,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent as BaseDialogContent,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { getDesktopBridge } from "@/lib/desktop";
import { DotmSquare3 } from "@/components/ui/dotm-square-3";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { type ExtensionGridItem } from "@/components/ExtensionGrid";

type ValidationResult = {
  valid: boolean;
  normalizedPath: string | null;
  readable: boolean;
  audioFileCount: number;
  samples: string[];
  error: string | null;
};

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: {
    libraryRoot: string | null;
    libraryRoots: string[];
    stats: { activeFiles: number; removedFiles: number };
  };
  onSaveRoot: (path: string) => Promise<void>;
  onRemoveRoot: (path: string) => Promise<void>;
  scanStatus: {
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
  };
  onStartScan: () => Promise<void>;
  collections: { id: string; name: string; fileCount?: number }[];
  tags: { id: string; name: string; color: string }[];
  onCreateCollection: (name: string) => Promise<void>;
  onDeleteCollection: (id: string) => Promise<void>;
  onCreateTag: (name: string) => Promise<void>;
  onDeleteTag: (id: string) => Promise<void>;
  // New props for extensions
  extensions: ExtensionGridItem[];
  onToggleExtension?: (id: string, enabled: boolean) => void;
}

export function SettingsDialog({
  open,
  onOpenChange,
  settings,
  onSaveRoot,
  onRemoveRoot,
  scanStatus,
  onStartScan,
  collections,
  tags,
  onCreateCollection,
  onDeleteCollection,
  onCreateTag,
  onDeleteTag,
  extensions = [],
  onToggleExtension,
}: SettingsDialogProps) {
  const resetKey = `${open ? "open" : "closed"}:${settings.libraryRoot ?? ""}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <BaseDialogContent className="flex !h-[85vh] !max-h-[850px] !w-[95vw] !max-w-5xl flex-col overflow-hidden border-border/40 bg-card/95 p-0 shadow-2xl backdrop-blur-2xl sm:!w-[90vw] lg:!w-[85vw]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,color-mix(in_oklab,var(--primary)_12%,transparent),transparent_34%)]" />

        {open ? (
          <SettingsDialogBody
            key={resetKey}
            settings={settings}
            onSaveRoot={onSaveRoot}
            onRemoveRoot={onRemoveRoot}
            scanStatus={scanStatus}
            onStartScan={onStartScan}
            collections={collections}
            tags={tags}
            onCreateCollection={onCreateCollection}
            onDeleteCollection={onDeleteCollection}
            onCreateTag={onCreateTag}
            onDeleteTag={onDeleteTag}
            extensions={extensions}
            onToggleExtension={onToggleExtension}
          />
        ) : null}
      </BaseDialogContent>
    </Dialog>
  );
}

type SettingsDialogBodyProps = Pick<
  SettingsDialogProps,
  | "settings"
  | "onSaveRoot"
  | "onRemoveRoot"
  | "scanStatus"
  | "onStartScan"
  | "collections"
  | "tags"
  | "onCreateCollection"
  | "onDeleteCollection"
  | "onCreateTag"
  | "onDeleteTag"
  | "extensions"
  | "onToggleExtension"
>;

function SettingsDialogBody({
  settings,
  onSaveRoot,
  onRemoveRoot,
  scanStatus,
  onStartScan,
  collections,
  tags,
  onCreateCollection,
  onDeleteCollection,
  onCreateTag,
  onDeleteTag,
  extensions,
  onToggleExtension,
}: SettingsDialogBodyProps) {
  const [rootDraft, setRootDraft] = useState("");
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isStartingScan, setIsStartingScan] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState("");
  const [newTagName, setNewTagName] = useState("");
  const folderInputRef = useRef<HTMLInputElement>(null);
  const collectionInputRef = useRef<HTMLInputElement>(null);
  const tagInputRef = useRef<HTMLInputElement>(null);

  const handleBrowse = async () => {
    const bridge = getDesktopBridge();
    if (bridge) {
      const result = await bridge.pickFolder();
      if (!result.ok || !result.path) return;

      setRootDraft(result.path);
      setValidationResult(null);

      const validation = await validatePathWith(result.path);
      if (validation?.valid && validation.normalizedPath) {
        setRootDraft(validation.normalizedPath);
      }
    } else {
      folderInputRef.current?.click();
    }
  };

  const handleWebFolderPicked = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const audioFiles = Array.from(files).filter((f) =>
      /\.(wav|mp3|flac|ogg|aiff|aac|m4a|wma)$/i.test(f.name),
    );

    const sampleNames = audioFiles.slice(0, 10).map((f) => f.name);
    const result: ValidationResult = {
      valid: audioFiles.length > 0,
      normalizedPath: null,
      readable: true,
      audioFileCount: audioFiles.length,
      samples: sampleNames,
      error: audioFiles.length === 0 ? "No supported audio files found in the selected folder." : null,
    };

    setValidationResult(result);
    event.target.value = "";
  };

  const validatePathWith = async (path: string) => {
    if (!path) {
      setValidationResult({
        valid: false,
        normalizedPath: null,
        readable: false,
        audioFileCount: 0,
        samples: [],
        error: "Enter a folder path first.",
      });
      return null;
    }

    setIsValidating(true);

    try {
      const response = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "validate", path }),
      });
      const result = (await response.json()) as ValidationResult;

      setValidationResult(result);

      if (!response.ok || !result.valid) {
        return result;
      }

      return result;
    } catch (error) {
      const result: ValidationResult = {
        valid: false,
        normalizedPath: null,
        readable: false,
        audioFileCount: 0,
        samples: [],
        error: error instanceof Error ? error.message : "Validation failed.",
      };
      setValidationResult(result);
      return result;
    } finally {
      setIsValidating(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);

    try {
      const validation = await validatePathWith(rootDraft.trim());
      if (!validation?.valid || !validation.normalizedPath) {
        toast.error(validation?.error ?? "Choose a valid library folder");
        return;
      }

      await onSaveRoot(validation.normalizedPath);
      setRootDraft("");
      setValidationResult(validation);
      toast.success("Library folder added");
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemoveRoot = async (path: string) => {
    await onRemoveRoot(path);
  };

  const handleStartScan = async () => {
    setIsStartingScan(true);

    try {
      await onStartScan();
    } finally {
      setIsStartingScan(false);
    }
  };

  const handleCreateCollection = async () => {
    const name = newCollectionName.trim();
    if (!name) return;

    await onCreateCollection(name);
    setNewCollectionName("");
  };

  const handleDeleteCollection = async (id: string, name: string) => {
    void name;
    await onDeleteCollection(id);
    collectionInputRef.current?.focus();
  };

  const handleCreateTag = async () => {
    const name = newTagName.trim();
    if (!name) return;

    await onCreateTag(name);
    setNewTagName("");
  };

  const handleDeleteTag = async (id: string, name: string) => {
    void name;
    await onDeleteTag(id);
    tagInputRef.current?.focus();
  };

  return (
    <Tabs defaultValue="library" orientation="vertical" className="relative flex h-full min-h-0 flex-1 flex-row">
      {/* Sidebar Navigation */}
      <aside className="flex w-64 shrink-0 flex-col border-r border-border/40 bg-card/60 backdrop-blur-xl">
        <div className="p-6">
          <h2 className="flex items-center gap-2 text-xl font-bold tracking-tight">
            <Database className="size-5 text-primary" />
            Settings
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            v2.1.0-alpha · Foleyard Core
          </p>
        </div>

        <TabsList className="flex flex-col items-stretch justify-start bg-transparent p-2">
          <TabsTrigger
            value="library"
            className="justify-start gap-3 rounded-xl px-4 py-2.5 text-sm transition-all hover:bg-accent/50 hover:text-accent-foreground data-active:bg-primary/10 data-active:text-primary data-active:shadow-[inset_3px_0_0_var(--primary)]"
          >
            <FolderOpen className="size-4" />
            Library & Storage
          </TabsTrigger>
          <TabsTrigger
            value="metadata"
            className="justify-start gap-3 rounded-xl px-4 py-2.5 text-sm transition-all hover:bg-accent/50 hover:text-accent-foreground data-active:bg-primary/10 data-active:text-primary data-active:shadow-[inset_3px_0_0_var(--primary)]"
          >
            <ListMusic className="size-4" />
            Playlists & Tags
          </TabsTrigger>
          <TabsTrigger
            value="extensions"
            className="justify-start gap-3 rounded-xl px-4 py-2.5 text-sm transition-all hover:bg-accent/50 hover:text-accent-foreground data-active:bg-primary/10 data-active:text-primary data-active:shadow-[inset_3px_0_0_var(--primary)]"
          >
            <Layers className="size-4" />
            Extensions
          </TabsTrigger>
          <Separator className="my-2 mx-4 opacity-50" />
          <TabsTrigger
            value="about"
            className="justify-start gap-3 rounded-xl px-4 py-2.5 text-sm transition-all hover:bg-accent/50 hover:text-accent-foreground data-active:bg-primary/10 data-active:text-primary data-active:shadow-[inset_3px_0_0_var(--primary)]"
          >
            <Info className="size-4" />
            About
          </TabsTrigger>
        </TabsList>

        <div className="mt-auto p-4">
          <div className="rounded-2xl border border-border/40 bg-card/60 p-3 shadow-sm backdrop-blur-xl">
             <div className="flex items-center gap-3">
              <DotmSquare3
                size={20}
                dotSize={3}
                speed={1.2}
                animated={scanStatus.running}
                pattern="full"
                className={scanStatus.running ? "text-primary" : "text-muted-foreground/50"}
              />
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Status</p>
                <p className="truncate text-[11px] font-medium">
                  {scanStatus.running ? scanStatus.phase : "Service Online"}
                </p>
              </div>
             </div>
          </div>
        </div>
      </aside>

      {/* Content Area */}
      <main className="relative flex flex-1 flex-col overflow-hidden bg-background/40">
        <ScrollArea className="h-full">
          {/* LIBRARY TAB */}
          <TabsContent value="library" className="m-0 flex-1 p-8 outline-none">
            <div className="mx-auto max-w-2xl space-y-8">
              <div>
                <h3 className="text-lg font-semibold tracking-tight">Library Location</h3>
                <p className="text-sm text-muted-foreground">
                  The primary folder where your audio samples are stored.
                </p>
              </div>

              <section className="space-y-4 rounded-2xl border border-border/40 bg-card/60 p-6 shadow-sm backdrop-blur-xl">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FolderOpen className="size-4 text-primary" />
                    <span className="text-sm font-medium">Library Folders</span>
                  </div>
                  {settings.libraryRoots.length > 0 ? (
                    <Badge variant="secondary" className="bg-primary/10 text-primary hover:bg-accent/50 hover:text-accent-foreground">Configured</Badge>
                  ) : (
                    <Badge variant="outline" className="border-primary/50 text-primary">Required</Badge>
                  )}
                </div>

                <div className="space-y-4">
                  <div className="flex gap-2">
                    <Input
                      value={rootDraft}
                      onChange={(event) => {
                        setRootDraft(event.target.value);
                        setValidationResult(null);
                      }}
                      placeholder="e.g. C:\Samples or /Volumes/Audio"
                      className="h-10 flex-1 border-border/40 bg-card/60 font-mono text-sm shadow-none"
                    />
                    <Button
                      variant="outline"
                      onClick={handleBrowse}
                      disabled={isValidating}
                      className="h-10 rounded-xl border-border/40 px-4 hover:bg-accent/50 hover:text-accent-foreground"
                    >
                      {isValidating ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <FolderOpen className="size-4" />
                      )}
                      Browse
                    </Button>
                    <input
                      ref={folderInputRef}
                      type="file"
                      className="hidden"
                      /* @ts-expect-error - webkitdirectory is a non-standard attribute */
                      webkitdirectory=""
                      onChange={handleWebFolderPicked}
                    />
                  </div>

                  <div className="divide-y divide-border/40 border-y border-border/40">
                    {settings.libraryRoots.length === 0 ? (
                      <div className="py-4 text-sm text-muted-foreground">
                        No library folders added.
                      </div>
                    ) : (
                      settings.libraryRoots.map((root) => (
                        <div key={root} className="flex items-center gap-3 py-2.5">
                          <FolderOpen className="size-4 shrink-0 text-muted-foreground" />
                          <span className="min-w-0 flex-1 truncate font-mono text-xs">
                            {root}
                          </span>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                            onClick={() => void handleRemoveRoot(root)}
                            aria-label={`Remove library folder ${root}`}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      ))
                    )}
                  </div>

                  {validationResult ? (
                    <ValidationMessage result={validationResult} />
                  ) : null}

                  <div className="flex items-center justify-between gap-4 pt-2">
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Add every folder you want included in scans.
                    </p>
                    <Button
                      onClick={handleSave}
                      disabled={
                        isSaving ||
                        isValidating ||
                        !rootDraft.trim() ||
                        settings.libraryRoots.includes(rootDraft.trim())
                      }
                      className="gap-2 rounded-xl shadow-lg shadow-primary/20"
                    >
                      {isSaving ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Save className="size-4" />
                      )}
                      Add Folder
                    </Button>
                  </div>
                </div>
              </section>

              <Separator className="opacity-50" />

              <div>
                <h3 className="text-lg font-semibold tracking-tight">Scan & Index</h3>
                <p className="text-sm text-muted-foreground">
                  Synchronize your database with the local filesystem.
                </p>
              </div>

              <section className="space-y-6 rounded-2xl border border-border/40 bg-card/60 p-6 shadow-sm backdrop-blur-xl">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                       <RefreshCw className={cn("size-4 text-primary", scanStatus.running && "animate-spin")} />
                       <span className="text-sm font-medium">Library Sync</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Refreshes metadata and discovers new files.
                    </p>
                  </div>
                  <Button
                    onClick={handleStartScan}
                    disabled={scanStatus.running || isStartingScan || settings.libraryRoots.length === 0}
                    variant={scanStatus.running ? "outline" : "default"}
                    className={cn(
                      "gap-2 rounded-xl h-10 px-6",
                      !scanStatus.running && "shadow-lg shadow-primary/10"
                    )}
                  >
                    {scanStatus.running || isStartingScan ? (
                      <RefreshCw className="size-4 animate-spin" />
                    ) : (
                      <Activity className="size-4" />
                    )}
                    {scanStatus.running ? "Scanning..." : "Start Full Scan"}
                  </Button>
                </div>

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <ScanStat label="Phase" value={scanStatus.phase} icon={<Layers className="size-3" />} />
                  <ScanStat label="Discovered" value={scanStatus.discovered} />
                  <ScanStat label="Indexed" value={scanStatus.indexed} />
                  <ScanStat label="Metadata" value={scanStatus.metadataProcessed} />
                  <ScanStat label="Added" value={scanStatus.added} variant="success" />
                  <ScanStat label="Removed" value={scanStatus.removed} variant="error" />
                </div>
              </section>
            </div>
          </TabsContent>

          {/* METADATA TAB */}
          <TabsContent value="metadata" className="m-0 flex-1 p-8 outline-none">
            <div className="mx-auto max-w-3xl space-y-10">
              <div>
                <h3 className="text-lg font-semibold tracking-tight">Playlists & Tags</h3>
                <p className="text-sm text-muted-foreground">
                  Manage library organization without leaving the settings panel.
                </p>
              </div>

              <section className="space-y-3">
                <div className="flex items-center justify-between gap-4">
                  <h4 className="flex items-center gap-2 text-sm font-semibold">
                    <ListMusic className="size-4 text-primary" />
                    Playlists
                  </h4>
                  <Badge variant="secondary" className="rounded-full px-2.5">
                    {collections.length}
                  </Badge>
                </div>

                <div className="flex gap-2">
                  <Input
                    ref={collectionInputRef}
                    placeholder="Collection name"
                    value={newCollectionName}
                    onChange={(event) => setNewCollectionName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") void handleCreateCollection();
                    }}
                    className="h-9 border-border/40 bg-card/60"
                  />
                  <Button
                    onClick={handleCreateCollection}
                    disabled={!newCollectionName.trim()}
                    className="h-9 rounded-xl px-4"
                  >
                    <Plus className="mr-1 size-4" />
                    Create
                  </Button>
                </div>

                <div className="divide-y divide-border/40 border-y border-border/40">
                  {collections.length === 0 ? (
                    <div className="py-8 text-center text-sm text-muted-foreground">
                      No playlists yet.
                    </div>
                  ) : (
                    collections.map((collection) => (
                      <div
                        key={collection.id}
                        className="group flex items-center gap-3 py-2.5 transition-colors hover:bg-accent/30"
                      >
                        <ListMusic className="ml-1 size-4 shrink-0 text-muted-foreground" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{collection.name}</p>
                        </div>
                        <span className="font-mono text-xs text-muted-foreground">
                          {collection.fileCount ?? 0}
                        </span>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="mr-1 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => handleDeleteCollection(collection.id, collection.name)}
                          aria-label={`Delete playlist ${collection.name}`}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              </section>

              <section className="space-y-3">
                <div className="flex items-center justify-between gap-4">
                  <h4 className="flex items-center gap-2 text-sm font-semibold">
                    <TagIcon className="size-4 text-primary" />
                    Tags
                  </h4>
                  <Badge variant="secondary" className="rounded-full px-2.5">
                    {tags.length}
                  </Badge>
                </div>

                <div className="flex gap-2">
                  <Input
                    ref={tagInputRef}
                    placeholder="New tag name"
                    value={newTagName}
                    onChange={(event) => setNewTagName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") void handleCreateTag();
                    }}
                    className="h-9 border-border/40 bg-card/60"
                  />
                  <Button
                    onClick={handleCreateTag}
                    disabled={!newTagName.trim()}
                    className="h-9 rounded-xl px-4"
                  >
                    <Plus className="mr-1 size-4" />
                    Add
                  </Button>
                </div>

                <div className="divide-y divide-border/40 border-y border-border/40">
                  {tags.length === 0 ? (
                    <div className="py-8 text-center text-sm text-muted-foreground">
                      No tags yet.
                    </div>
                  ) : (
                    tags.map((tag) => (
                      <div
                        key={tag.id}
                        className="group flex items-center gap-3 py-2.5 transition-colors hover:bg-accent/30"
                      >
                        <span
                          className="ml-1 size-2.5 shrink-0 rounded-full ring-1 ring-border/50"
                          style={{ backgroundColor: tag.color }}
                        />
                        <p className="min-w-0 flex-1 truncate text-sm font-medium">
                          {tag.name}
                        </p>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="mr-1 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => handleDeleteTag(tag.id, tag.name)}
                          aria-label={`Delete tag ${tag.name}`}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              </section>
            </div>
          </TabsContent>

          {/* EXTENSIONS TAB */}
          <TabsContent value="extensions" className="m-0 flex-1 p-8 outline-none">
            <div className="mx-auto max-w-2xl space-y-8">
              <div>
                <h3 className="text-lg font-semibold tracking-tight">Extension Management</h3>
                <p className="text-sm text-muted-foreground">
                  Enable or disable workflow tools and third-party integrations.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-4">
                {extensions.length === 0 ? (
                  <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/40 bg-card/60 p-12 text-center shadow-sm backdrop-blur-xl">
                    <Layers className="size-12 opacity-10 mb-4" />
                    <p className="text-sm font-medium">No extensions installed</p>
                    <p className="text-xs text-muted-foreground mt-1 max-w-[240px]">
                      Extensions allow you to add custom commands and workflows to Foleyard.
                    </p>
                  </div>
                ) : (
                  extensions.map((ext) => (
                    <div key={ext.id} className="group flex items-center justify-between rounded-2xl border border-border/40 bg-card/60 p-4 shadow-sm backdrop-blur-xl transition-[background-color,border-color] hover:bg-accent/50 hover:text-accent-foreground">
                      <div className="flex items-center gap-4">
                        <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary font-bold">
                          {ext.name.slice(0, 1).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                             <p className="font-semibold text-sm truncate">{ext.name}</p>
                             <Badge variant="outline" className="text-[10px] h-4 px-1 opacity-70">v{ext.version}</Badge>
                          </div>
                          <p className="text-xs text-muted-foreground truncate max-w-[300px]">{ext.description}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right hidden sm:block">
                           <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Status</p>
                           <p className={cn("text-xs font-medium", ext.enabled ? "text-primary" : "text-muted-foreground")}>
                              {ext.enabled ? "Active" : "Inactive"}
                           </p>
                        </div>
                        <Switch
                          checked={ext.enabled}
                          onCheckedChange={(checked) => onToggleExtension?.(ext.id, checked)}
                        />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </TabsContent>

          {/* ABOUT TAB */}
          <TabsContent value="about" className="m-0 flex-1 p-8 outline-none">
             <div className="mx-auto max-w-2xl h-full flex flex-col items-center justify-center text-center space-y-6 py-12">
                <div className="size-24 rounded-3xl bg-[radial-gradient(circle_at_top_left,var(--primary),transparent)] border border-primary/20 flex items-center justify-center shadow-2xl">
                   <Database className="size-10 text-primary-foreground drop-shadow-lg" />
                </div>
                <div>
                   <h2 className="text-2xl font-bold tracking-tight">Foleyard</h2>
                   <p className="text-sm text-muted-foreground mt-1">Professional Sound Library Engine</p>
                </div>

                <div className="flex gap-4">
                   <Badge variant="secondary" className="h-6 px-3">v2.1.0-alpha</Badge>
                   <Badge variant="outline" className="h-6 px-3">Desktop Core</Badge>
                </div>

                <p className="text-sm text-muted-foreground max-w-md leading-relaxed">
                   Foleyard is an open-source audio asset manager designed for speed and reliability.
                   Built for sound designers, composers, and game developers who need instant access to their sonic palette.
                </p>

                <div className="flex gap-2 pt-4">
                   <Button variant="outline" className="rounded-xl h-10 px-6 gap-2">
                      <ExternalLink className="size-4" /> Documentation
                   </Button>
                   <Button variant="outline" className="rounded-xl h-10 px-6 gap-2">
                      <Monitor className="size-4" /> GitHub
                   </Button>
                </div>

                <div className="pt-12 text-[10px] text-muted-foreground opacity-50 space-y-1">
                   <p>© 2026 Foleyard Contributors</p>
                   <p>MIT Licensed · Built with Next.js, Electron & SQLite</p>
                </div>
             </div>
          </TabsContent>
        </ScrollArea>
      </main>
    </Tabs>
  );
}

function ValidationMessage({ result }: { result: ValidationResult }) {
  return (
    <div
      className={cn(
        "flex gap-3 rounded-xl border p-4 shadow-inner backdrop-blur-sm transition-all animate-in fade-in slide-in-from-top-2",
        result.valid
          ? "border-primary/30 bg-primary/10 text-foreground"
          : "border-destructive/30 bg-destructive/10 text-destructive",
      )}
    >
      {result.valid ? (
        <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/20 text-primary">
          <CheckCircle2 className="size-4" />
        </div>
      ) : (
        <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-destructive/20 text-destructive">
          <AlertCircle className="size-4" />
        </div>
      )}
      <div className="min-w-0">
        <p className="font-semibold text-sm">
          {result.valid ? "Path Verified" : "Invalid Folder"}
        </p>
        <p className="mt-0.5 text-xs opacity-80">
          {result.valid
            ? `Found ${result.audioFileCount} supported audio files.`
            : result.error}
        </p>
        {result.valid && result.normalizedPath ? (
          <div className="mt-2 rounded border border-border/40 bg-muted/50 p-1.5 font-mono text-[10px] text-muted-foreground">
            {result.normalizedPath}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ScanStat({
  label,
  value,
  icon,
  variant = "default"
}: {
  label: string;
  value: string | number;
  icon?: React.ReactNode;
  variant?: "default" | "success" | "error";
}) {
  return (
    <div className="group rounded-xl border border-border/40 bg-card/60 p-3 shadow-sm backdrop-blur-xl transition-colors hover:bg-accent/50 hover:text-accent-foreground">
      <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground group-hover:text-primary transition-colors">
        {icon}
        {label}
      </div>
      <p className={cn(
        "mt-1 truncate font-mono text-lg font-bold",
        variant === "success" && "text-primary",
        variant === "error" && "text-destructive",
        variant === "default" && "text-foreground"
      )}>
        {value}
      </p>
    </div>
  );
}
