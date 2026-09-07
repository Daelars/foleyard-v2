"use client";

import type { SettingsDialogProps, SettingsDialogBodyProps } from "./types";

import { Database, ListMusic, FolderOpen, Layers, Monitor, Info, SlidersHorizontal } from "lucide-react";

import { Dialog, DialogContent as BaseDialogContent, DialogTitle } from "@/components/ui/dialog";

import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { DotmSquare3 } from "@/components/ui/dotm-square-3";
import { ScrollArea } from "@/components/ui/scroll-area";

import { LibraryTab } from "./library-tab";
import { MetadataTab } from "./metadata-tab";
import { ExtensionsTab } from "./extensions-tab";
import { AppearanceTab } from "./appearance-tab";
import { ShortcutsTab } from "./shortcuts-tab";
import { AboutTab, APP_VERSION } from "./about-tab";
export function SettingsDialog({ open, onOpenChange, ...props }: SettingsDialogProps) {
  const resetKey = `${open ? "open" : "closed"}:${props.settings.libraryRoot ?? ""}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <BaseDialogContent className="flex !h-[85vh] !max-h-[850px] !w-[96vw] !max-w-6xl flex-col overflow-hidden border-white/10 bg-shell/95 p-0 shadow-2xl backdrop-blur-2xl sm:!w-[94vw] lg:!w-[92vw]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,color-mix(in_oklab,var(--primary)_12%,transparent),transparent_34%)]" />
        {open ? <SettingsDialogBody key={resetKey} {...props} /> : null}
      </BaseDialogContent>
    </Dialog>
  );
}


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
  extensions = [],
  onToggleExtension,
  onUpdateExtensionSetting,
  v2Settings,
  zoom = 100,
  onUpdateZoom,
  shortcutBindings,
  onRebindShortcut,
  onResetShortcuts,
  removeDefault,
  onRemoveDefaultChange,
}: SettingsDialogBodyProps) {
  return (
    <>
    <Tabs defaultValue="library" orientation="vertical" className="relative flex h-full min-h-0 flex-1 flex-row gap-0 bg-transparent">
      {/* Sidebar Navigation */}
      <aside className="flex w-64 shrink-0 flex-col border-r border-white/10">
        <div className="p-6">
          <DialogTitle className="flex items-center gap-2 text-xl font-extrabold tracking-tight text-zinc-50">
            <Database className="size-5 text-accent-text" />
            Settings
          </DialogTitle>
          <p className="mt-1.5 font-mono text-[11px] tracking-wide text-zinc-500">
            v{APP_VERSION} · Foleyard Core
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
          <LibraryTab settings={settings} onSaveRoot={onSaveRoot} onRemoveRoot={onRemoveRoot} scanStatus={scanStatus} onStartScan={onStartScan} />

          {/* METADATA TAB */}
          <MetadataTab collections={collections} tags={tags} onCreateCollection={onCreateCollection} onDeleteCollection={onDeleteCollection} onRenameCollection={onRenameCollection} onConvertToRegularCollection={onConvertToRegularCollection} onCreateTag={onCreateTag} onDeleteTag={onDeleteTag} />

          {/* EXTENSIONS TAB */}
          <ExtensionsTab extensions={extensions} onToggleExtension={onToggleExtension} onUpdateExtensionSetting={onUpdateExtensionSetting} v2Settings={v2Settings} />

          {/* APPEARANCE TAB */}
          <AppearanceTab zoom={zoom} onUpdateZoom={onUpdateZoom} />

          {/* CUSTOMISATION TAB */}
          <ShortcutsTab shortcutBindings={shortcutBindings} onRebindShortcut={onRebindShortcut} onResetShortcuts={onResetShortcuts} removeDefault={removeDefault} onRemoveDefaultChange={onRemoveDefaultChange} />

          {/* ABOUT TAB */}
          <AboutTab  />
        </ScrollArea>
      </main>
    </Tabs>
    </>
  );
}
