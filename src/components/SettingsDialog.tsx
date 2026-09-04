"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Database,
  Download,
  Filter,
  ListMusic,
  FolderOpen,
  Loader2,
  Pencil,
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
  ChevronDown,
  SlidersHorizontal,
  Keyboard,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent as BaseDialogContent,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { getDesktopBridge } from "@/lib/desktop";
import { DotmSquare3 } from "@/components/ui/dotm-square-3";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { type ExtensionGridItem } from "@/components/ExtensionGrid";
import {
  DEFAULT_SHORTCUTS,
  SHORTCUT_LABELS,
  findBindingConflicts,
  type RemoveDefault,
  type ShortcutAction,
  type ShortcutBindings,
} from "@/components/Shortcuts/shortcuts";

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
  collections: { id: string; name: string; fileCount?: number; isSmart?: boolean; filter?: string | null }[];
  tags: { id: string; name: string; color: string }[];
  onCreateCollection: (name: string) => Promise<void>;
  onDeleteCollection: (id: string) => Promise<void>;
  onRenameCollection?: (id: string, name: string) => void;
  onConvertToRegularCollection?: (id: string) => void;
  onCreateTag: (name: string) => Promise<void>;
  onDeleteTag: (id: string) => Promise<void>;
  // New props for extensions
  extensions: ExtensionGridItem[];
  onToggleExtension?: (id: string, enabled: boolean) => void;
  onUpdateExtensionSetting?: (
    extensionId: string,
    settingId: string,
    value: unknown,
  ) => void;
  zoom?: number;
  onUpdateZoom?: (zoom: number) => void;
  shortcutBindings?: ShortcutBindings;
  onRebindShortcut?: (action: ShortcutAction, key: string) => void;
  onResetShortcuts?: () => void;
  removeDefault?: RemoveDefault;
  onRemoveDefaultChange?: (value: RemoveDefault) => void;
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
  onRenameCollection,
  onConvertToRegularCollection,
  onCreateTag,
  onDeleteTag,
  extensions = [],
  onToggleExtension,
  onUpdateExtensionSetting,
  zoom = 100,
  onUpdateZoom,
  shortcutBindings,
  onRebindShortcut,
  onResetShortcuts,
  removeDefault,
  onRemoveDefaultChange,
}: SettingsDialogProps) {
  const resetKey = `${open ? "open" : "closed"}:${settings.libraryRoot ?? ""}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <BaseDialogContent className="flex !h-[85vh] !max-h-[850px] !w-[96vw] !max-w-6xl flex-col overflow-hidden border-white/10 bg-shell/95 p-0 shadow-2xl backdrop-blur-2xl sm:!w-[94vw] lg:!w-[92vw]">
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
            onRenameCollection={onRenameCollection}
            onConvertToRegularCollection={onConvertToRegularCollection}
            onCreateTag={onCreateTag}
            onDeleteTag={onDeleteTag}
            extensions={extensions}
            onToggleExtension={onToggleExtension}
            onUpdateExtensionSetting={onUpdateExtensionSetting}
            zoom={zoom}
            onUpdateZoom={onUpdateZoom}
            shortcutBindings={shortcutBindings}
            onRebindShortcut={onRebindShortcut}
            onResetShortcuts={onResetShortcuts}
            removeDefault={removeDefault}
            onRemoveDefaultChange={onRemoveDefaultChange}
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
  | "onRenameCollection"
  | "onConvertToRegularCollection"
  | "onCreateTag"
  | "onDeleteTag"
  | "extensions"
  | "onToggleExtension"
  | "onUpdateExtensionSetting"
  | "zoom"
  | "onUpdateZoom"
  | "shortcutBindings"
  | "onRebindShortcut"
  | "onResetShortcuts"
  | "removeDefault"
  | "onRemoveDefaultChange"
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
  onRenameCollection,
  onConvertToRegularCollection,
  onCreateTag,
  onDeleteTag,
  extensions,
  onToggleExtension,
  onUpdateExtensionSetting,
  zoom = 100,
  onUpdateZoom,
  shortcutBindings,
  onRebindShortcut,
  onResetShortcuts,
  removeDefault,
  onRemoveDefaultChange,
}: SettingsDialogBodyProps) {
  const [rootDraft, setRootDraft] = useState("");
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isStartingScan, setIsStartingScan] = useState(false);
  const [isCheckingForUpdates, setIsCheckingForUpdates] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState("");
  const [newTagName, setNewTagName] = useState("");
  const [expandedExtensionId, setExpandedExtensionId] = useState<string | null>(null);
  const [confirmRemoveRoot, setConfirmRemoveRoot] = useState<string | null>(null);
  const [confirmDeleteItem, setConfirmDeleteItem] = useState<
    { kind: "collection" | "tag"; id: string; name: string } | null
  >(null);
  const [rebindingAction, setRebindingAction] =
    useState<ShortcutAction | null>(null);
  const manualUpdateToastRef = useRef<string | number | null>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const collectionInputRef = useRef<HTMLInputElement>(null);
  const tagInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const bridge = getDesktopBridge();

    if (!bridge) {
      return;
    }

    const finishManualCheck = () => {
      setIsCheckingForUpdates(false);
      manualUpdateToastRef.current = null;
    };

    const unsubAvailable = bridge.onUpdateAvailable((info) => {
      const id = manualUpdateToastRef.current;
      if (id != null) {
        toast.loading(`Update v${info.version} available. Downloading...`, { id });
        finishManualCheck();
      }
    });

    const unsubReady = bridge.onUpdateReady((info) => {
      const id = manualUpdateToastRef.current;
      if (id != null) {
        toast.success(`Update v${info.version} is ready`, { id });
        finishManualCheck();
      }
    });

    const unsubNotAvailable = bridge.onUpdateNotAvailable(() => {
      const id = manualUpdateToastRef.current;
      if (id != null) {
        toast.success("Foleyard is up to date", { id });
        finishManualCheck();
      }
    });

    const unsubError = bridge.onUpdateError((info) => {
      const id = manualUpdateToastRef.current;
      if (id != null) {
        toast.error(`Update check failed: ${info.message}`, { id });
        finishManualCheck();
      }
    });

    return () => {
      unsubAvailable();
      unsubReady();
      unsubNotAvailable();
      unsubError();
    };
  }, []);

  const handleSliderChange = (value: number | readonly number[]) => {
    const nextZoom = Array.isArray(value) ? value[0] : value;
    onUpdateZoom?.(nextZoom);
  };

  const handleResetZoom = () => {
    onUpdateZoom?.(100);
  };

  const handleCheckForUpdates = async () => {
    const bridge = getDesktopBridge();

    if (!bridge) {
      toast.error("Update checks are only available in the desktop app");
      return;
    }

    setIsCheckingForUpdates(true);
    manualUpdateToastRef.current = toast.loading("Checking for updates...");

    try {
      const result = await bridge.checkForUpdates();

      if (!result.ok) {
        toast.error("Update check failed", { id: manualUpdateToastRef.current ?? undefined });
        setIsCheckingForUpdates(false);
        manualUpdateToastRef.current = null;
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Update check failed",
        { id: manualUpdateToastRef.current ?? undefined },
      );
      setIsCheckingForUpdates(false);
      manualUpdateToastRef.current = null;
    }
  };

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

  const handleConfirmRemoveRoot = async () => {
    const path = confirmRemoveRoot;
    setConfirmRemoveRoot(null);
    if (path) {
      await handleRemoveRoot(path);
    }
  };

  const handleConfirmDeleteItem = async () => {
    const item = confirmDeleteItem;
    setConfirmDeleteItem(null);
    if (!item) return;
    if (item.kind === "collection") {
      await handleDeleteCollection(item.id, item.name);
    } else {
      await handleDeleteTag(item.id, item.name);
    }
  };

  const handleStartScan = async () => {
    setIsStartingScan(true);

    try {
      await onStartScan();
    } finally {
      setIsStartingScan(false);
    }
  };

  useEffect(() => {
    if (!rebindingAction || !onRebindShortcut) {
      return;
    }

    const onKey = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();

      if (event.key === "Escape") {
        setRebindingAction(null);
        return;
      }

      if (
        ["Shift", "Control", "Alt", "Meta", "Tab", "CapsLock"].includes(
          event.key,
        )
      ) {
        return;
      }

      const key =
        event.key === " "
          ? "Space"
          : event.key.length === 1
            ? event.key.toLowerCase()
            : event.key;
      const conflicts = findBindingConflicts({
        ...(shortcutBindings ?? DEFAULT_SHORTCUTS),
        [rebindingAction]: key,
      });

      if (conflicts.length > 0) {
        const other = conflicts[0].actions.find(
          (action) => action !== rebindingAction,
        );
        toast.error(
          other
            ? `Already assigned to ${SHORTCUT_LABELS[other]}`
            : "That key is already assigned",
        );
        return;
      }

      onRebindShortcut(rebindingAction, key);
      setRebindingAction(null);
    };

    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [rebindingAction, shortcutBindings, onRebindShortcut]);

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
    <>
    <Tabs defaultValue="library" orientation="vertical" className="relative flex h-full min-h-0 flex-1 flex-row gap-0 bg-transparent">
      {/* Sidebar Navigation */}
      <aside className="flex w-64 shrink-0 flex-col border-r border-white/10">
        <div className="p-6">
          <h2 className="flex items-center gap-2 text-xl font-extrabold tracking-tight text-zinc-50">
            <Database className="size-5 text-accent-text" />
            Settings
          </h2>
          <p className="mt-1.5 font-mono text-[11px] tracking-wide text-zinc-500">
            v2.1.0-alpha · Foleyard Core
          </p>
        </div>

        <TabsList className="flex flex-col items-stretch justify-start bg-transparent p-2">
          <TabsTrigger
            value="library"
            className="justify-start gap-3 rounded-xl border border-transparent px-4 py-2.5 text-sm text-zinc-400 transition-all hover:border-white/10 hover:bg-white/5 hover:text-zinc-200 data-active:border-accent-fill/50 data-active:bg-accent-fill/15 data-active:text-accent-text data-active:shadow-glow-accent"
          >
            <FolderOpen className="size-4" />
            Library & Storage
          </TabsTrigger>
          <TabsTrigger
            value="metadata"
            className="justify-start gap-3 rounded-xl border border-transparent px-4 py-2.5 text-sm text-zinc-400 transition-all hover:border-white/10 hover:bg-white/5 hover:text-zinc-200 data-active:border-accent-fill/50 data-active:bg-accent-fill/15 data-active:text-accent-text data-active:shadow-glow-accent"
          >
            <ListMusic className="size-4" />
            Collections & Tags
          </TabsTrigger>
          <TabsTrigger
            value="extensions"
            className="justify-start gap-3 rounded-xl border border-transparent px-4 py-2.5 text-sm text-zinc-400 transition-all hover:border-white/10 hover:bg-white/5 hover:text-zinc-200 data-active:border-accent-fill/50 data-active:bg-accent-fill/15 data-active:text-accent-text data-active:shadow-glow-accent"
          >
            <Layers className="size-4" />
            Extensions
          </TabsTrigger>
          <TabsTrigger
            value="appearance"
            className="justify-start gap-3 rounded-xl border border-transparent px-4 py-2.5 text-sm text-zinc-400 transition-all hover:border-white/10 hover:bg-white/5 hover:text-zinc-200 data-active:border-accent-fill/50 data-active:bg-accent-fill/15 data-active:text-accent-text data-active:shadow-glow-accent"
          >
            <Monitor className="size-4" />
            Appearance
          </TabsTrigger>
          <TabsTrigger
            value="customisation"
            className="justify-start gap-3 rounded-xl border border-transparent px-4 py-2.5 text-sm text-zinc-400 transition-all hover:border-white/10 hover:bg-white/5 hover:text-zinc-200 data-active:border-accent-fill/50 data-active:bg-accent-fill/15 data-active:text-accent-text data-active:shadow-glow-accent"
          >
            <SlidersHorizontal className="size-4" />
            Customisation
          </TabsTrigger>
          <Separator className="my-2 mx-4 opacity-50" />
          <TabsTrigger
            value="about"
            className="justify-start gap-3 rounded-xl border border-transparent px-4 py-2.5 text-sm text-zinc-400 transition-all hover:border-white/10 hover:bg-white/5 hover:text-zinc-200 data-active:border-accent-fill/50 data-active:bg-accent-fill/15 data-active:text-accent-text data-active:shadow-glow-accent"
          >
            <Info className="size-4" />
            About
          </TabsTrigger>
        </TabsList>

        <div className="mt-auto p-4">
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-3">
             <div className="flex items-center gap-3">
              <DotmSquare3
                size={20}
                dotSize={3}
                speed={1.2}
                animated={scanStatus.running}
                pattern="full"
                className={scanStatus.running ? "text-accent-text" : "text-zinc-500"}
              />
              <div className="min-w-0">
                <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-zinc-500">Status</p>
                <p className="truncate text-[11px] font-medium text-zinc-200">
                  {scanStatus.running ? scanStatus.phase : "Service Online"}
                </p>
              </div>
             </div>
          </div>
        </div>
      </aside>

      {/* Content Area */}
      <main className="relative flex flex-1 flex-col overflow-hidden">
        <ScrollArea className="h-full">
          {/* LIBRARY TAB */}
          <TabsContent value="library" className="m-0 flex-1 p-8 outline-none">
            <div className="mx-auto w-full max-w-4xl space-y-8">
              <div>
                <h3 className="text-3xl font-bold tracking-tight text-zinc-50">Library location</h3>
                <p className="mt-1 text-[13px] text-zinc-500">
                  The primary folder where your audio samples are stored.
                </p>
              </div>

              <section className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FolderOpen className="size-4 text-accent-text" />
                    <span className="text-sm font-medium text-zinc-200">Library folders</span>
                  </div>
                  {settings.libraryRoots.length > 0 ? (
                    <Badge variant="secondary" className="rounded-full bg-accent-fill/15 font-mono text-accent-text">Configured</Badge>
                  ) : (
                    <Badge variant="outline" className="rounded-full border-accent-fill/50 font-mono text-accent-text">Required</Badge>
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
                      className="h-10 flex-1 rounded-xl border-white/10 bg-black/30 font-mono text-sm shadow-none"
                    />
                    <Button
                      variant="outline"
                      onClick={handleBrowse}
                      disabled={isValidating}
                      className="h-10 rounded-xl border-white/10 bg-white/5 px-4 text-zinc-200 shadow-none backdrop-blur-none hover:border-accent-fill/50 hover:bg-white/[0.08] hover:text-zinc-100"
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

                  <div className="divide-y divide-white/5 border-y border-white/10">
                    {settings.libraryRoots.length === 0 ? (
                      <div className="py-4 text-sm text-zinc-500">
                        No library folders added.
                      </div>
                    ) : (
                      settings.libraryRoots.map((root) => (
                        <div key={root} className="flex items-center gap-3 py-2.5">
                          <FolderOpen className="size-4 shrink-0 text-zinc-500" />
                          <span className="min-w-0 flex-1 truncate font-mono text-xs text-zinc-200">
                            {root}
                          </span>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className="text-zinc-500 hover:bg-destructive/15 hover:text-destructive"
                            onClick={() => setConfirmRemoveRoot(root)}
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
                    <p className="text-xs text-zinc-500 leading-relaxed">
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
                      className="gap-2 rounded-lg"
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
                <h3 className="text-3xl font-bold tracking-tight text-zinc-50">Scan & index</h3>
                <p className="mt-1 text-[13px] text-zinc-500">
                  Synchronize your database with the local filesystem.
                </p>
              </div>

              <section className="space-y-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                       <RefreshCw className={cn("size-4 text-accent-text", scanStatus.running && "animate-spin")} />
                       <span className="text-sm font-medium text-zinc-200">Library sync</span>
                    </div>
                    <p className="text-xs text-zinc-500">
                      Refreshes metadata and discovers new files.
                    </p>
                  </div>
                  <Button
                    onClick={handleStartScan}
                    disabled={scanStatus.running || isStartingScan || settings.libraryRoots.length === 0}
                    variant={scanStatus.running ? "outline" : "default"}
                    className={cn(
                      "gap-2 rounded-lg h-10 px-6",
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
                <h3 className="text-3xl font-bold tracking-tight text-zinc-50">Collections & tags</h3>
                <p className="mt-1 text-[13px] text-zinc-500">
                  Manage library organization without leaving the settings panel.
                </p>
              </div>

              <section className="space-y-3">
                <div className="flex items-center justify-between gap-4">
                  <h4 className="flex items-center gap-2 text-sm font-semibold text-zinc-200">
                    <ListMusic className="size-4 text-accent-text" />
                    Collections
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
                    className="h-9 rounded-xl border-white/10 bg-black/30"
                  />
                  <Button
                    onClick={handleCreateCollection}
                    disabled={!newCollectionName.trim()}
                    className="h-9 rounded-lg px-4"
                  >
                    <Plus className="mr-1 size-4" />
                    Create
                  </Button>
                </div>

                <div className="divide-y divide-white/5 border-y border-white/10">
                  {collections.length === 0 ? (
                    <div className="py-8 text-center text-sm text-zinc-500">
                      No collections yet.
                    </div>
                  ) : (
                    collections.map((collection) => {
                      const isSmart = collection.isSmart ?? false;
                      return (
                        <div
                          key={collection.id}
                          className="group flex items-center gap-3 py-2.5 transition-colors hover:bg-white/5"
                        >
                          {isSmart ? (
                            <Filter className="ml-1 size-4 shrink-0 text-zinc-500" />
                          ) : (
                            <ListMusic className="ml-1 size-4 shrink-0 text-zinc-500" />
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-zinc-100">
                              {collection.name}
                              {isSmart && (
                                <Badge variant="outline" className="ml-2 text-[10px] px-1.5 py-0 leading-tight align-middle">
                                  Smart
                                </Badge>
                              )}
                            </p>
                          </div>
                          <span className="font-mono text-xs text-zinc-500">
                            {collection.fileCount ?? 0}
                          </span>
                          {isSmart && onConvertToRegularCollection && (
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              className="text-zinc-500 opacity-0 transition-opacity hover:bg-white/5 hover:text-zinc-200 group-hover:opacity-100"
                              onMouseDown={(event) => event.preventDefault()}
                              onClick={() => onConvertToRegularCollection(collection.id)}
                              aria-label={`Convert ${collection.name} to a regular collection`}
                              title="Convert to regular collection"
                            >
                              <ListMusic className="size-4" />
                            </Button>
                          )}
                          {onRenameCollection && (
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              className="text-zinc-500 opacity-0 transition-opacity hover:bg-white/5 hover:text-zinc-200 group-hover:opacity-100"
                              onMouseDown={(event) => event.preventDefault()}
                              onClick={() => onRenameCollection(collection.id, collection.name)}
                              aria-label={`Rename ${collection.name}`}
                            >
                              <Pencil className="size-4" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className="mr-1 text-zinc-500 opacity-0 transition-opacity hover:bg-destructive/15 hover:text-destructive group-hover:opacity-100"
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => setConfirmDeleteItem({ kind: "collection", id: collection.id, name: collection.name })}
                                aria-label={`Delete collection ${collection.name}`}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      );
                    })
                  )}
                </div>
              </section>

              <section className="space-y-3">
                <div className="flex items-center justify-between gap-4">
                  <h4 className="flex items-center gap-2 text-sm font-semibold text-zinc-200">
                    <TagIcon className="size-4 text-accent-text" />
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
                    className="h-9 rounded-xl border-white/10 bg-black/30"
                  />
                  <Button
                    onClick={handleCreateTag}
                    disabled={!newTagName.trim()}
                    className="h-9 rounded-lg px-4"
                  >
                    <Plus className="mr-1 size-4" />
                    Add
                  </Button>
                </div>

                <div className="divide-y divide-white/5 border-y border-white/10">
                  {tags.length === 0 ? (
                    <div className="py-8 text-center text-sm text-zinc-500">
                      No tags yet.
                    </div>
                  ) : (
                    tags.map((tag) => (
                      <div
                        key={tag.id}
                        className="group flex items-center gap-3 py-2.5 transition-colors hover:bg-white/5"
                      >
                        <span
                          className="ml-1 size-2.5 shrink-0 rounded-full ring-1 ring-white/15"
                          style={{ backgroundColor: tag.color }}
                        />
                        <p className="min-w-0 flex-1 truncate text-sm font-medium text-zinc-100">
                          {tag.name}
                        </p>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="mr-1 text-zinc-500 opacity-0 transition-opacity hover:bg-destructive/15 hover:text-destructive group-hover:opacity-100"
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => setConfirmDeleteItem({ kind: "tag", id: tag.id, name: tag.name })}
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
          <TabsContent value="extensions" className="m-0 flex-1 p-6 outline-none">
            <div className="w-full space-y-8">
              <div>
                <h3 className="text-3xl font-bold tracking-tight text-zinc-50">Extension management</h3>
                <p className="mt-1 text-[13px] text-zinc-500">
                  Enable or disable workflow tools and third-party integrations.
                </p>
              </div>

              <div className="divide-y divide-white/5 border-y border-white/10">
                {extensions.length === 0 ? (
                  <div className="flex flex-col items-center justify-center p-12 text-center">
                    <Layers className="size-12 opacity-10 mb-4" />
                    <p className="text-sm font-medium text-zinc-200">No extensions installed</p>
                    <p className="text-xs text-zinc-500 mt-1 max-w-[240px]">
                      Extensions allow you to add custom commands and workflows to Foleyard.
                    </p>
                  </div>
                ) : (
                  extensions.map((ext) => {
                    const hasSettings = Boolean(ext.settings?.length);
                    const isExpanded = expandedExtensionId === ext.id;

                    return (
                      <Collapsible
                        key={ext.id}
                        open={hasSettings ? isExpanded : false}
                        onOpenChange={(open) =>
                          setExpandedExtensionId(open ? ext.id : null)
                        }
                        className="transition-colors"
                      >
                        <div
                          className={cn(
                            "flex items-center gap-4 px-4 py-4 transition-colors hover:bg-white/5 sm:px-5",
                            isExpanded && "bg-white/5",
                          )}
                        >
                          {hasSettings ? (
                            <CollapsibleTrigger
                              render={
                                <button
                                  type="button"
                                  className="flex min-w-0 flex-1 items-center justify-between gap-4 rounded-lg text-left outline-none transition-colors hover:text-zinc-100 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                                  aria-label={`${isExpanded ? "Hide" : "Show"} ${ext.name} settings`}
                                >
                                  <div className="flex min-w-0 items-center gap-4">
                                    <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent-fill/12 font-bold text-accent-text">
                                      {ext.name.slice(0, 1).toUpperCase()}
                                    </div>
                                    <div className="min-w-0">
                                      <div className="flex items-center gap-2">
                                        <p className="truncate text-sm font-semibold text-zinc-100">{ext.name}</p>
                                        <Badge variant="outline" className="h-4 px-1 text-[10px] opacity-70">
                                          v{ext.version}
                                        </Badge>
                                        <Badge variant="secondary" className="hidden h-4 px-1 text-[10px] sm:inline-flex">
                                          {ext.settings?.length} settings
                                        </Badge>
                                      </div>
                                      <p className="max-w-[300px] truncate text-xs text-zinc-500">
                                        {ext.description}
                                      </p>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-3">
                                    <ChevronDown
                                      data-icon="inline-start"
                                      className={cn(
                                        "transition-transform",
                                        isExpanded && "rotate-180",
                                      )}
                                    />
                                  </div>
                                </button>
                              }
                            />
                          ) : (
                            <div className="flex min-w-0 flex-1 items-center justify-between gap-4">
                              <div className="flex min-w-0 items-center gap-4">
                                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent-fill/12 font-bold text-accent-text">
                                  {ext.name.slice(0, 1).toUpperCase()}
                                </div>
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2">
                                    <p className="truncate text-sm font-semibold text-zinc-100">{ext.name}</p>
                                    <Badge variant="outline" className="h-4 px-1 text-[10px] opacity-70">
                                      v{ext.version}
                                    </Badge>
                                  </div>
                                  <p className="max-w-[300px] truncate text-xs text-zinc-500">
                                    {ext.description}
                                  </p>
                                </div>
                              </div>
                            </div>
                          )}
                          <Switch
                            checked={ext.enabled}
                            onCheckedChange={(checked) => onToggleExtension?.(ext.id, checked)}
                          />
                        </div>

                        {hasSettings ? (
                          <CollapsibleContent keepMounted className="px-4 pb-5 sm:px-5">
                            <div className="border-t border-white/5 pt-4">
                              {ext.id === "drop-rules" ? (
                                <DropRulesSettingsPanel
                                  extension={ext}
                                  onUpdate={onUpdateExtensionSetting}
                                />
                              ) : (
                                <div className="flex flex-col divide-y divide-white/5 border-y border-white/5">
                                  {ext.settings?.map((setting) => (
                                    <ExtensionSettingControl
                                      key={setting.id}
                                      extensionId={ext.id}
                                      setting={setting}
                                      disabled={false}
                                      onUpdate={onUpdateExtensionSetting}
                                    />
                                  ))}
                                </div>
                              )}
                            </div>
                          </CollapsibleContent>
                        ) : null}
                      </Collapsible>
                    );
                  })
                )}
              </div>
            </div>
          </TabsContent>

          {/* APPEARANCE TAB */}
          <TabsContent value="appearance" className="m-0 flex-1 p-8 outline-none">
            <div className="mx-auto w-full max-w-2xl space-y-8">
              <div>
                <h3 className="text-3xl font-bold tracking-tight text-zinc-50">Appearance</h3>
                <p className="mt-1 text-[13px] text-zinc-500">
                  Customize how Foleyard looks on your display.
                </p>
              </div>

              <section className="space-y-6 rounded-xl border border-white/10 bg-white/[0.02] p-6">
                <div className="flex items-center justify-between">
                   <div className="space-y-1">
                     <div className="flex items-center gap-2">
                       <Monitor className="size-4 text-accent-text" />
                       <span className="text-sm font-medium text-zinc-200">Interface zoom</span>
                     </div>
                     <p className="text-xs text-zinc-500">
                        Scale the entire UI. Useful for high-DPI screens.
                     </p>
                   </div>
                   <Badge variant="secondary" className="rounded-full bg-white/5 font-mono tabular-nums text-zinc-200">{zoom}%</Badge>
                </div>

                <div className="space-y-4">
                  <Slider
                    value={[zoom]}
                    min={50}
                    max={200}
                    step={5}
                    onValueChange={handleSliderChange}
                  />
                  <div className="flex justify-between font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-600">
                    <span>50%</span>
                    <span>100%</span>
                    <span>200%</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleResetZoom}
                    disabled={zoom === 100}
                    className="h-8 rounded-lg border-white/15 bg-white/5 font-mono text-[10px] uppercase tracking-widest text-zinc-200 hover:border-accent-fill/50 hover:text-zinc-100 disabled:opacity-40"
                  >
                    Reset to Default
                  </Button>
                </div>
              </section>
            </div>
          </TabsContent>

          {/* CUSTOMISATION TAB */}
          <TabsContent value="customisation" className="m-0 flex-1 p-8 outline-none">
            <div className="mx-auto w-full max-w-3xl space-y-10">
              <div>
                <h3 className="text-3xl font-bold tracking-tight text-zinc-50">Customisation</h3>
                <p className="mt-1 text-[13px] text-zinc-500">
                  Keyboard shortcuts and destructive-action defaults. Changes apply immediately.
                </p>
              </div>

              <section className="space-y-3">
                <div className="flex items-center justify-between gap-4">
                  <h4 className="flex items-center gap-2 text-sm font-semibold text-zinc-200">
                    <Keyboard className="size-4 text-accent-text" />
                    Keyboard shortcuts
                  </h4>
                  {onResetShortcuts ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        onResetShortcuts();
                        setRebindingAction(null);
                      }}
                      className="h-8 rounded-lg border-white/15 bg-white/5 font-mono text-[10px] uppercase tracking-widest text-zinc-200 hover:border-accent-fill/50 hover:text-zinc-100"
                    >
                      Reset to defaults
                    </Button>
                  ) : null}
                </div>
                <p className="text-xs text-zinc-500">
                  Select a shortcut, then press a new key. Shortcuts apply
                  immediately and are kept on this device.
                </p>

                <div className="divide-y divide-white/5 border-y border-white/10">
                  {(Object.keys(DEFAULT_SHORTCUTS) as ShortcutAction[]).map(
                    (action) => {
                      const bindings = shortcutBindings ?? DEFAULT_SHORTCUTS;
                      const key = bindings[action];
                      const rebinding = rebindingAction === action;
                      return (
                        <div
                          key={action}
                          className="flex items-center gap-3 py-2.5"
                        >
                          <p className="min-w-0 flex-1 truncate text-sm font-medium text-zinc-100">
                            {SHORTCUT_LABELS[action]}
                          </p>
                          <kbd className="shrink-0 rounded-md border border-white/10 bg-white/5 px-2 py-1 font-mono text-[11px] text-zinc-300">
                            {rebinding
                              ? "Press a key…"
                              : key === "Space"
                                ? "Space"
                                : key.length === 1
                                  ? key.toUpperCase()
                                  : key}
                          </kbd>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              setRebindingAction(rebinding ? null : action)
                            }
                            disabled={!onRebindShortcut}
                            className="h-8 shrink-0 rounded-lg px-3 text-xs text-zinc-400 hover:bg-white/5 hover:text-zinc-100"
                          >
                            {rebinding ? "Cancel" : "Change"}
                          </Button>
                        </div>
                      );
                    },
                  )}
                </div>
              </section>

              <section className="space-y-3">
                <div className="flex items-center justify-between gap-4">
                  <h4 className="flex items-center gap-2 text-sm font-semibold text-zinc-200">
                    <Trash2 className="size-4 text-accent-text" />
                    Remove default
                  </h4>
                </div>
                <p className="text-xs text-zinc-500">
                  Choose which remove behavior the bulk bar confirms with. You
                  can still pick the other option in the confirm dialog.
                </p>

                <div
                  role="radiogroup"
                  aria-label="Default remove behavior"
                  className="space-y-2"
                >
                  <button
                    type="button"
                    role="radio"
                    aria-checked={(removeDefault ?? "library") === "library"}
                    onClick={() => onRemoveDefaultChange?.("library")}
                    disabled={!onRemoveDefaultChange}
                    className={`w-full rounded-xl border p-3 text-left transition-colors ${(removeDefault ?? "library") === "library" ? "border-accent-fill/60 bg-accent-fill/10" : "border-white/10 bg-white/[0.02] hover:border-white/20"}`}
                  >
                    <span className="text-sm font-semibold text-zinc-100">
                      Remove from library
                    </span>
                    <span className="mt-0.5 block text-xs text-zinc-500">
                      Sounds no longer appear in Foleyard. Your files on disk
                      are untouched.
                    </span>
                  </button>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={(removeDefault ?? "library") === "disk"}
                    onClick={() => onRemoveDefaultChange?.("disk")}
                    disabled={!onRemoveDefaultChange}
                    className={`w-full rounded-xl border p-3 text-left transition-colors ${(removeDefault ?? "library") === "disk" ? "border-destructive/60 bg-destructive/10" : "border-white/10 bg-white/[0.02] hover:border-white/20"}`}
                  >
                    <span className="text-sm font-semibold text-zinc-100">
                      Delete from disk
                    </span>
                    <span className="mt-0.5 block text-xs text-zinc-500">
                      Permanently delete sounds from disk. This cannot be
                      undone.
                    </span>
                  </button>
                </div>
              </section>
            </div>
          </TabsContent>

          {/* ABOUT TAB */}
          <TabsContent value="about" className="m-0 flex-1 p-8 outline-none">
             <div className="mx-auto max-w-3xl space-y-8">
                <div>
                  <h3 className="text-3xl font-bold tracking-tight text-zinc-50">About</h3>
                  <p className="mt-1 text-[13px] text-zinc-500">
                    Version info, updates, and help.
                  </p>
                </div>
                <div className="flex items-center gap-3 border-y border-white/10 py-4">
                   <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent-fill/12 text-accent-text">
                     <Database className="size-5" />
                   </div>
                   <div className="min-w-0 flex-1">
                     <p className="text-sm font-semibold text-zinc-100">Foleyard</p>
                      <p className="text-xs text-zinc-500">Local-first sound library</p>
                   </div>
                   <Badge variant="secondary" className="h-6 rounded-md bg-white/5 px-3 font-mono text-zinc-200">v2.1.0-alpha</Badge>
                   <Badge variant="outline" className="h-6 rounded-md border-white/15 px-3 font-mono text-zinc-400">Desktop Core</Badge>
                </div>

                <p className="max-w-2xl text-sm leading-6 text-zinc-400">
                   Foleyard is an open-source sound library. It indexes local audio so you can search and organize it.
                </p>

                <div className="flex gap-2 border-t border-white/10 pt-4">
                   <Button
                     variant="outline"
                     className="h-10 gap-2 rounded-xl border-white/10 bg-white/5 px-4 text-zinc-200 hover:border-accent-fill/50 hover:text-zinc-100"
                     onClick={handleCheckForUpdates}
                     disabled={isCheckingForUpdates}
                   >
                      {isCheckingForUpdates ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Download className="size-4" />
                      )}
                      Check for Updates
                   </Button>
                   <Button
                     variant="outline"
                     className="h-10 gap-2 rounded-xl border-white/10 bg-white/5 px-4 text-zinc-200 hover:border-accent-fill/50 hover:text-zinc-100"
                     onClick={() => window.open("https://github.com/Daelars/foleyard-v2#readme", "_blank", "noopener,noreferrer")}
                   >
                      <ExternalLink className="size-4" /> Documentation
                   </Button>
                   <Button
                     variant="outline"
                     className="h-10 gap-2 rounded-xl border-white/10 bg-white/5 px-4 text-zinc-200 hover:border-accent-fill/50 hover:text-zinc-100"
                     onClick={() => window.open("https://github.com/Daelars/foleyard-v2", "_blank", "noopener,noreferrer")}
                   >
                      <Monitor className="size-4" /> GitHub
                   </Button>
                </div>

                <div className="space-y-1 border-t border-white/10 pt-4 font-mono text-[10px] text-zinc-600">
                   <p>© 2026 Foleyard Contributors</p>
                   <p>MIT Licensed · Built with Next.js, Electron & SQLite</p>
                </div>
             </div>
          </TabsContent>
        </ScrollArea>
      </main>
    </Tabs>

    <AlertDialog
      open={confirmRemoveRoot !== null}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) setConfirmRemoveRoot(null);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove library folder?</AlertDialogTitle>
          <AlertDialogDescription>
            {confirmRemoveRoot ? (
              <>
                <span className="font-mono text-xs text-zinc-300">{confirmRemoveRoot}</span>
                <br />
                This folder will no longer be scanned or indexed. Your files on
                disk are not deleted.
              </>
            ) : null}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive/15 text-destructive hover:bg-destructive/25"
            onClick={() => void handleConfirmRemoveRoot()}
          >
            Remove folder
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <AlertDialog
      open={confirmDeleteItem !== null}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) setConfirmDeleteItem(null);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Delete {confirmDeleteItem?.kind === "tag" ? "tag" : "collection"}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            {confirmDeleteItem ? (
              <>
                &ldquo;<span className="text-zinc-200">{confirmDeleteItem.name}</span>&rdquo; will be
                removed. Your audio files are not deleted. This cannot be undone.
              </>
            ) : null}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive/15 text-destructive hover:bg-destructive/25"
            onClick={() => void handleConfirmDeleteItem()}
          >
            Delete {confirmDeleteItem?.kind === "tag" ? "tag" : "collection"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}

type ExtensionSetting = NonNullable<ExtensionGridItem["settings"]>[number];

function DropRulesSettingsPanel({
  extension,
  onUpdate,
}: {
  extension: ExtensionGridItem;
  onUpdate?: (extensionId: string, settingId: string, value: unknown) => void;
}) {
  const settings = extension.settings ?? [];
  const renamePatternInputRef = useRef<HTMLInputElement>(null);
  const copyOnDrop = getBooleanSetting(settings, "copy-on-drop", true);
  const renameOnDrop = getBooleanSetting(settings, "rename-on-drop", true);
  const markUsed = getBooleanSetting(settings, "mark-used", true);
  const renamePattern = getStringSetting(
    settings,
    "rename-pattern",
    "{index}-{name}{ext}",
  );
  const dragOutFolder = getStringSetting(settings, "drag-out-folder", "");
  const renamePatternSetting = getSetting(settings, "rename-pattern");
  const dragOutFolderSetting = getSetting(settings, "drag-out-folder");
  const [renamePatternDraft, setRenamePatternDraft] = useState(renamePattern);
  const renamePreview = buildDropRulesRenamePreview(renamePatternDraft);
  const stagingMuted = !copyOnDrop && !renameOnDrop;

  const updateSetting = (settingId: string, value: unknown) => {
    onUpdate?.(extension.id, settingId, value);
  };

  const handleRenamePatternCommit = () => {
    if (renamePatternDraft !== renamePattern) {
      updateSetting("rename-pattern", renamePatternDraft);
    }
  };

  const handleInsertToken = (token: string) => {
    const input = renamePatternInputRef.current;
    const start = input?.selectionStart ?? renamePatternDraft.length;
    const end = input?.selectionEnd ?? renamePatternDraft.length;
    const nextPattern = `${renamePatternDraft.slice(0, start)}${token}${renamePatternDraft.slice(end)}`;

    setRenamePatternDraft(nextPattern);
    updateSetting("rename-pattern", nextPattern);

    window.requestAnimationFrame(() => {
      input?.focus();
      const cursor = start + token.length;
      input?.setSelectionRange(cursor, cursor);
    });
  };

  const handleRestoreDefaults = () => {
    for (const setting of settings) {
      updateSetting(setting.id, setting.defaultValue);
    }
    setRenamePatternDraft(
      String(renamePatternSetting?.defaultValue ?? "{index}-{name}{ext}"),
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <DropRulesCurrentBehaviour
        copyOnDrop={copyOnDrop}
        dragOutFolder={dragOutFolder}
        markUsed={markUsed}
        renameOnDrop={renameOnDrop}
        renamePattern={renamePatternDraft}
      />

      <DropRulesSettingGroup title="Rules">
        <DropRulesToggleRow
          checked={copyOnDrop}
          description="Use a safe prepared copy instead of dragging the original file."
          label="Copy on drop"
          onCheckedChange={(checked) => updateSetting("copy-on-drop", checked)}
        />
        <DropRulesToggleRow
          checked={renameOnDrop}
          description="Apply a rename pattern before the file leaves Foleyard."
          label="Rename on drop"
          onCheckedChange={(checked) => updateSetting("rename-on-drop", checked)}
        />
        <DropRulesToggleRow
          checked={markUsed}
          description="Write a small used-sounds report when sounds leave Foleyard."
          label="Mark used"
          onCheckedChange={(checked) => updateSetting("mark-used", checked)}
        />
      </DropRulesSettingGroup>

      <DropRulesSettingGroup
        title="Rename"
        description={
          renameOnDrop
            ? "Build the filename Foleyard prepares before drag-out."
            : "Enable Rename on drop to use this pattern."
        }
        muted={!renameOnDrop}
      >
        <div className="grid gap-2 px-3 py-3 sm:grid-cols-[1fr_300px] sm:items-start">
          <div className="min-w-0">
            <label htmlFor="drop-rules-rename-pattern" className="text-sm font-medium text-zinc-100">
              {renamePatternSetting?.label ?? "Rename pattern"}
            </label>
            <p className="mt-0.5 text-xs text-zinc-500">
              Supports {"{name}"}, {"{index}"}, {"{ext}"}, {"{format}"}, {"{date}"}, and {"{time}"}.
            </p>
          </div>
          <div className="flex min-w-0 flex-col gap-2">
            <Input
              id="drop-rules-rename-pattern"
              ref={renamePatternInputRef}
              disabled={!renameOnDrop}
              value={renamePatternDraft}
              onChange={(event) => setRenamePatternDraft(event.target.value)}
              onBlur={handleRenamePatternCommit}
            />
            <div className="rounded-lg border border-white/10 bg-black/30 px-3 py-2">
              <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                Preview
              </p>
              <p
                className={cn(
                  "mt-1 truncate font-mono text-sm",
                  renamePreview.valid ? "text-zinc-200" : "text-destructive",
                )}
              >
                {renamePreview.output}
              </p>
            </div>
          </div>
        </div>
        <Separator />
        <div className="flex flex-wrap gap-1.5 px-3 py-3">
          {["{name}", "{index}", "{ext}", "{format}", "{date}", "{time}"].map(
            (token) => (
              <Button
                key={token}
                type="button"
                variant="outline"
                size="xs"
                disabled={!renameOnDrop}
                onClick={() => handleInsertToken(token)}
              >
                {token}
              </Button>
            ),
          )}
        </div>
      </DropRulesSettingGroup>

      <DropRulesSettingGroup
        title="Staging"
        description={
          stagingMuted
            ? "Staging is used when Foleyard prepares a copy."
            : "Choose where prepared drag-out files are staged."
        }
        muted={stagingMuted}
      >
        <div className="grid gap-2 px-3 py-3 sm:grid-cols-[1fr_300px] sm:items-center">
          <div className="min-w-0">
            <label htmlFor="drop-rules-drag-out-folder" className="text-sm font-medium text-zinc-100">
              {dragOutFolderSetting?.label ?? "Prepared drag folder"}
            </label>
            <p className="mt-0.5 text-xs text-zinc-500">
              Optional folder for prepared drag-out copies. Leave blank to use the system temp folder.
            </p>
          </div>
          <div className="flex min-w-0 flex-col gap-2">
            <Input
              id="drop-rules-drag-out-folder"
              disabled={stagingMuted}
              defaultValue={dragOutFolder}
              onBlur={(event) =>
                updateSetting("drag-out-folder", event.target.value)
              }
            />
            <Badge variant="outline" className="w-fit">
              {dragOutFolder.trim() ? "Custom staging folder" : "System temp folder"}
            </Badge>
          </div>
        </div>
      </DropRulesSettingGroup>

      <div className="flex justify-end border-t border-white/10 pt-3">
        <Button type="button" variant="outline" size="sm" onClick={handleRestoreDefaults}>
          Restore defaults
        </Button>
      </div>
    </div>
  );
}

function DropRulesCurrentBehaviour({
  copyOnDrop,
  dragOutFolder,
  markUsed,
  renameOnDrop,
  renamePattern,
}: {
  copyOnDrop: boolean;
  dragOutFolder: string;
  markUsed: boolean;
  renameOnDrop: boolean;
  renamePattern: string;
}) {
  const renamePreview = buildDropRulesRenamePreview(renamePattern);
  const hasActiveRule = copyOnDrop || renameOnDrop || markUsed;
  const stagingLabel = dragOutFolder.trim()
    ? "Custom staging folder"
    : "System temp folder";

  return (
    <section className="rounded-lg border border-white/10 bg-white/[0.04] p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold text-zinc-200">Current behaviour</p>
          <p className="truncate text-xs text-zinc-500">
            When dragging a sound out of Foleyard:
          </p>
        </div>
        <Badge variant={hasActiveRule ? "default" : "outline"}>
          {hasActiveRule ? "Rules active" : "Original unchanged"}
        </Badge>
      </div>
      <div className="mt-3 grid gap-1.5 text-xs text-zinc-400 sm:grid-cols-2">
        <DropRulesBehaviourLine>
          {copyOnDrop ? "Creates a safe prepared copy" : "Uses the original file"}
        </DropRulesBehaviourLine>
        <DropRulesBehaviourLine>
          {renameOnDrop
            ? `Renames using: ${renamePattern.trim() ? renamePattern : renamePreview.output}`
            : "No rename applied"}
        </DropRulesBehaviourLine>
        <DropRulesBehaviourLine>
          {markUsed ? "Marks sound as used" : "No usage report written"}
        </DropRulesBehaviourLine>
        <DropRulesBehaviourLine>Staging: {stagingLabel}</DropRulesBehaviourLine>
      </div>
    </section>
  );
}

function DropRulesBehaviourLine({ children }: { children: ReactNode }) {
  return (
    <p className="flex min-w-0 items-center gap-2">
      <span className="size-1.5 shrink-0 rounded-full bg-zinc-500" />
      <span className="min-w-0 truncate">{children}</span>
    </p>
  );
}

function DropRulesToggleRow({
  checked,
  description,
  label,
  onCheckedChange,
}: {
  checked: boolean;
  description: string;
  label: string;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      className="grid cursor-pointer gap-2 px-3 py-3 text-left transition-colors hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:grid-cols-[1fr_auto] sm:items-center"
      onClick={() => onCheckedChange(!checked)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onCheckedChange(!checked);
        }
      }}
    >
      <span className="min-w-0 sm:pr-4">
        <span className="block text-sm font-medium text-zinc-100">{label}</span>
        <span className="mt-0.5 block text-xs text-zinc-500">{description}</span>
      </span>
      <span className="flex justify-start sm:justify-end">
        <Switch
          checked={checked}
          onCheckedChange={onCheckedChange}
          onClick={(event) => event.stopPropagation()}
        />
      </span>
    </div>
  );
}

function DropRulesSettingGroup({
  children,
  description,
  muted = false,
  title,
}: {
  children: ReactNode;
  description?: string;
  muted?: boolean;
  title: string;
}) {
  return (
    <section className={cn("flex flex-col gap-2", muted && "opacity-55")}>
      <div className="flex flex-col gap-0.5">
        <h4 className="text-sm font-semibold tracking-tight text-zinc-100">{title}</h4>
        {description ? (
          <p className="text-xs text-zinc-500">{description}</p>
        ) : null}
      </div>
      <div className="flex flex-col divide-y divide-white/5 border-y border-white/10">
        {children}
      </div>
    </section>
  );
}

type DropRulesRenamePreview = {
  output: string;
  valid: boolean;
};

function buildDropRulesRenamePreview(pattern: string): DropRulesRenamePreview {
  const trimmedPattern = pattern.trim();

  if (!trimmedPattern) {
    return {
      output: "Pattern is empty",
      valid: false,
    };
  }

  const date = "2026-05-07";
  const time = "14-30-00";
  const output = trimmedPattern
    .replaceAll("{index}", "001")
    .replaceAll("{name}", "whoosh-rise")
    .replaceAll("{ext}", ".wav")
    .replaceAll("{format}", "wav")
    .replaceAll("{date}", date)
    .replaceAll("{time}", time);
  const cleanOutput = output.replace(/[<>:"/\\|?*\x00-\x1f]/g, "-");

  return {
    output: cleanOutput || "001-whoosh-rise.wav",
    valid: Boolean(cleanOutput.trim()),
  };
}

function getSetting(
  settings: ExtensionSetting[],
  settingId: string,
) {
  return settings.find((setting) => setting.id === settingId);
}

function getBooleanSetting(
  settings: ExtensionSetting[],
  settingId: string,
  fallback: boolean,
) {
  const value = getSetting(settings, settingId)?.value;
  return typeof value === "boolean" ? value : fallback;
}

function getStringSetting(
  settings: ExtensionSetting[],
  settingId: string,
  fallback: string,
) {
  const value = getSetting(settings, settingId)?.value;
  return typeof value === "string" ? value : fallback;
}

function ExtensionSettingControl({
  disabled,
  extensionId,
  onUpdate,
  setting,
}: {
  disabled: boolean;
  extensionId: string;
  onUpdate?: (extensionId: string, settingId: string, value: unknown) => void;
  setting: ExtensionSetting;
}) {
  const inputId = `extension-${extensionId}-${setting.id}`;

  return (
    <div className="grid gap-2 px-3 py-3 sm:grid-cols-[1fr_220px] sm:items-center">
      <div className="min-w-0">
        <label htmlFor={inputId} className="text-sm font-medium text-zinc-100">
          {setting.label}
        </label>
        {setting.description ? (
          <p className="mt-0.5 text-xs text-zinc-500">
            {setting.description}
          </p>
        ) : null}
      </div>

      {setting.type === "boolean" ? (
        <div className="flex justify-start sm:justify-end">
          <Switch
            id={inputId}
            disabled={disabled}
            checked={Boolean(setting.value)}
            onCheckedChange={(checked) =>
              onUpdate?.(extensionId, setting.id, checked)
            }
          />
        </div>
      ) : setting.type === "select" ? (
        <select
          id={inputId}
          disabled={disabled}
          value={String(setting.value ?? setting.defaultValue ?? "")}
          onChange={(event) =>
            onUpdate?.(extensionId, setting.id, event.target.value)
          }
          className="h-8 rounded-lg border border-white/10 bg-black/30 px-2 text-sm text-zinc-100 outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50"
        >
          {setting.options?.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : (
        <Input
          id={inputId}
          disabled={disabled}
          type={setting.type === "number" ? "number" : "text"}
          defaultValue={String(setting.value ?? setting.defaultValue ?? "")}
          onBlur={(event) => {
            const value =
              setting.type === "number"
                ? Number.parseFloat(event.target.value)
                : event.target.value;
            onUpdate?.(extensionId, setting.id, value);
          }}
        />
      )}
    </div>
  );
}

function ValidationMessage({ result }: { result: ValidationResult }) {
  return (
    <div
      className={cn(
        "flex gap-3 rounded-xl border p-4 transition-all animate-in fade-in slide-in-from-top-2",
        result.valid
          ? "border-accent-fill/30 bg-accent-fill/10 text-zinc-100"
          : "border-destructive/30 bg-destructive/10 text-destructive",
      )}
    >
      {result.valid ? (
        <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent-fill/20 text-accent-text">
          <CheckCircle2 className="size-4" />
        </div>
      ) : (
        <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-destructive/20 text-destructive">
          <AlertCircle className="size-4" />
        </div>
      )}
      <div className="min-w-0">
        <p className="font-semibold text-sm">
              {result.valid ? "Path verified" : "Invalid folder"}
        </p>
        <p className="mt-0.5 text-xs opacity-80">
          {result.valid
            ? `Found ${result.audioFileCount} supported audio files.`
            : result.error}
        </p>
        {result.valid && result.normalizedPath ? (
          <div className="mt-2 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 font-mono text-[10px] text-zinc-400">
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
    <div className="group rounded-xl border border-white/10 bg-white/[0.02] p-3 transition-colors hover:bg-white/5">
      <div className="flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-500 group-hover:text-accent-text transition-colors">
        {icon}
        {label}
      </div>
      <p className={cn(
        "mt-1 truncate font-mono text-lg font-bold tabular-nums",
        variant === "success" && "text-accent-text",
        variant === "error" && "text-destructive",
        variant === "default" && "text-zinc-100"
      )}>
        {value}
      </p>
    </div>
  );
}
