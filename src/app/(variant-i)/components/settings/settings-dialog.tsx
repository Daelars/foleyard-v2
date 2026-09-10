"use client";

// app-v3 adapter for SettingsDialog: same props, tabs and callbacks, I-styled
// dialog with the library segmented tab bar in place of the sidebar nav.
import { useState } from "react";
import { Database, FolderOpen, Info, Layers, ListMusic, Monitor, SlidersHorizontal } from "lucide-react";

import { Dialog, DialogDescription, DialogTitle, TabPanel, Tabs } from "@/components/variant-i";

import { cn } from "@/lib/utils";

import type { SettingsDialogBodyProps, SettingsDialogProps } from "@/components/settings/types";

import { V3SettingsLibraryTab } from "./library-tab";
import { V3SettingsMetadataTab } from "./metadata-tab";
import { V3SettingsExtensionsTab } from "./extensions-tab";
import { V3SettingsAppearanceTab } from "./appearance-tab";
import { V3SettingsShortcutsTab } from "./shortcuts-tab";
import { V3SettingsAboutTab, APP_VERSION } from "./about-tab";

export type { SettingsDialogProps } from "@/components/settings/types";

const SETTINGS_TABS = [
  { value: "library", label: "Library & Storage", icon: <FolderOpen /> },
  { value: "metadata", label: "Collections & Tags", icon: <ListMusic /> },
  { value: "extensions", label: "Extensions", icon: <Layers /> },
  { value: "appearance", label: "Appearance", icon: <Monitor /> },
  { value: "customisation", label: "Customisation", icon: <SlidersHorizontal /> },
  { value: "about", label: "About", icon: <Info /> },
] as const;

type SettingsTab = (typeof SETTINGS_TABS)[number]["value"];

export function V3SettingsDialog({ open, onOpenChange, ...props }: SettingsDialogProps) {
  const resetKey = `${open ? "open" : "closed"}:${props.settings.libraryRoot ?? ""}`;

  return (
    <Dialog
      open={open}
      onClose={() => onOpenChange(false)}
      labelledBy="v3-settings-title"
      describedBy="v3-settings-desc"
      maxWidth="max-w-3xl"
    >
      {open ? <V3SettingsDialogBody key={resetKey} {...props} /> : null}
    </Dialog>
  );
}

function V3SettingsDialogBody({
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
  v2Settings,
  zoom = 100,
  onUpdateZoom,
  shortcutBindings,
  onRebindShortcut,
  onResetShortcuts,
  removeDefault,
  onRemoveDefaultChange,
}: SettingsDialogBodyProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>("library");

  return (
    <div className="flex max-h-[82vh] flex-col">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <DialogTitle id="v3-settings-title">
            <span className="inline-flex items-center gap-2">
              <Database className="size-5 text-accent-text" />
              Settings
            </span>
          </DialogTitle>
          <DialogDescription id="v3-settings-desc">
            <span className="font-mono text-[11px] tracking-wide text-zinc-500">
              v{APP_VERSION} · Foleyard Core
            </span>
          </DialogDescription>
        </div>
        <div className="flex shrink-0 items-center gap-3 rounded-lg border border-[var(--vi-edge)] bg-black/25 px-3 py-2.5">
          <span
            aria-hidden
            className={cn(
              "size-2.5 shrink-0 rounded-full",
              scanStatus.running
                ? "bg-accent-fill shadow-[0_0_10px_color-mix(in_oklab,var(--accent-fill)_50%,transparent)] motion-safe:animate-pulse"
                : "bg-zinc-500",
            )}
          />
          <div className="min-w-0">
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-500">Status</p>
            <p className="truncate text-xs font-medium text-zinc-200">
              {scanStatus.running ? scanStatus.phase : "Service Online"}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-4">
        <Tabs label="Settings sections" tabs={SETTINGS_TABS} value={activeTab} onChange={setActiveTab} />
      </div>

      <div className="vi-scroll -mx-1 mt-4 min-h-0 flex-1 overflow-y-auto px-1">
        <div className={cn(activeTab !== "library" && "hidden")}>
          <TabPanel tabKey="library">
            <V3SettingsLibraryTab
              settings={settings}
              onSaveRoot={onSaveRoot}
              onRemoveRoot={onRemoveRoot}
              scanStatus={scanStatus}
              onStartScan={onStartScan}
            />
          </TabPanel>
        </div>

        <div className={cn(activeTab !== "metadata" && "hidden")}>
          <TabPanel tabKey="metadata">
            <V3SettingsMetadataTab
              collections={collections}
              tags={tags}
              onCreateCollection={onCreateCollection}
              onDeleteCollection={onDeleteCollection}
              onRenameCollection={onRenameCollection}
              onConvertToRegularCollection={onConvertToRegularCollection}
              onCreateTag={onCreateTag}
              onDeleteTag={onDeleteTag}
            />
          </TabPanel>
        </div>

        <div className={cn(activeTab !== "extensions" && "hidden")}>
          <TabPanel tabKey="extensions">
            <V3SettingsExtensionsTab v2Settings={v2Settings} />
          </TabPanel>
        </div>

        <div className={cn(activeTab !== "appearance" && "hidden")}>
          <TabPanel tabKey="appearance">
            <V3SettingsAppearanceTab zoom={zoom} onUpdateZoom={onUpdateZoom} />
          </TabPanel>
        </div>

        <div className={cn(activeTab !== "customisation" && "hidden")}>
          <TabPanel tabKey="customisation">
            <V3SettingsShortcutsTab
              shortcutBindings={shortcutBindings}
              onRebindShortcut={onRebindShortcut}
              onResetShortcuts={onResetShortcuts}
              removeDefault={removeDefault}
              onRemoveDefaultChange={onRemoveDefaultChange}
            />
          </TabPanel>
        </div>

        <div className={cn(activeTab !== "about" && "hidden")}>
          <TabPanel tabKey="about">
            <V3SettingsAboutTab />
          </TabPanel>
        </div>
      </div>
    </div>
  );
}