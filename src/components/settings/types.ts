import type { ExtensionGridItem } from "@/lib/extensions/types";
import type { ScanStatusResponse } from "@/lib/scanner/types";
import type { RemoveDefault, ShortcutAction, ShortcutBindings } from "@/components/Shortcuts/shortcuts";
export type ValidationResult = {
  valid: boolean;
  normalizedPath: string | null;
  readable: boolean;
  audioFileCount: number;
  samples: string[];
  error: string | null;
};

export interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: {
    libraryRoot: string | null;
    libraryRoots: string[];
    stats: { activeFiles: number; removedFiles: number };
  };
  onSaveRoot: (path: string) => Promise<void>;
  onRemoveRoot: (path: string) => Promise<void>;
  scanStatus: ScanStatusResponse;
  onStartScan: () => Promise<void>;
  collections: { id: string; name: string; fileCount?: number; isSmart?: boolean; filter?: string | null }[];
  tags: { id: string; name: string; color: string }[];
  onCreateCollection: (name: string, color?: string) => Promise<string | null | void>;
  onDeleteCollection: (id: string) => Promise<void>;
  onRenameCollection?: (id: string, name: string) => void;
  onConvertToRegularCollection?: (id: string) => void;
  onCreateTag: (name: string, color?: string) => Promise<string | null | void>;
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

export type SettingsDialogBodyProps = Pick<
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

export type LibraryTabProps = Pick<SettingsDialogProps, "settings" | "onSaveRoot" | "onRemoveRoot" | "scanStatus" | "onStartScan">;

export type MetadataTabProps = Pick<SettingsDialogProps, "collections" | "tags" | "onCreateCollection" | "onDeleteCollection" | "onRenameCollection" | "onConvertToRegularCollection" | "onCreateTag" | "onDeleteTag">;

export type ExtensionsTabProps = Pick<SettingsDialogProps, "extensions" | "onToggleExtension" | "onUpdateExtensionSetting">;

export type AppearanceTabProps = Pick<SettingsDialogProps, "zoom" | "onUpdateZoom">;

export type ShortcutsTabProps = Pick<SettingsDialogProps, "shortcutBindings" | "onRebindShortcut" | "onResetShortcuts" | "removeDefault" | "onRemoveDefaultChange">;
