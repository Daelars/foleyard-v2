import type { YardExtensionManifest } from "@yard-core";

import type { ExtensionGridItem } from "@/lib/extensions/types";
import { getExtensionEnabled, setExtensionEnabled } from "@/lib/db";
import { getExtensionSettingValue } from "@/lib/extensions/settings-store";

import { extensionRegistry } from "./runtime";

import {
  manifest,
  registerCommands,
} from "@foleyard/sound-shelf";
import { DbSoundShelfStore } from "@/lib/extensions/sound-shelf-store";
import {
  manifest as makePackManifest,
  registerCommands as registerMakePackCommands,
} from "@foleyard/make-pack";
import {
  manifest as dropRulesManifest,
  registerCommands as registerDropRulesCommands,
} from "@foleyard/drop-rules";
import {
  manifest as folderJanitorManifest,
  registerCommands as registerFolderJanitorCommands,
} from "@foleyard/folder-janitor";
import {
  manifest as libraryGathererManifest,
  registerCommands as registerLibraryGathererCommands,
} from "@foleyard/library-gatherer";
import {
  manifest as smartCollectionsManifest,
  registerCommands as registerSmartCollectionsCommands,
} from "@foleyard/smart-collections";

function toGridItem(manifest: YardExtensionManifest): ExtensionGridItem {
  return {
    id: manifest.id,
    name: manifest.name,
    provider: manifest.provider,
    version: manifest.version,
    description: manifest.description,
    category: manifest.category,
    enabled: getExtensionEnabled(manifest.id),
    commandCount: manifest.commands.length,
    commands: manifest.commands.map((command) => ({
      id: command.id,
      title: command.title,
    })),
    permissionCount: manifest.permissions.length,
    permissions: [...manifest.permissions],
    surfaceCount: manifest.surfaces?.length ?? 0,
    surfaces: manifest.surfaces ? [...manifest.surfaces] : [],
    settingsCount: manifest.settings?.length ?? 0,
    settings: manifest.settings?.map((setting) => ({
      id: setting.id,
      label: setting.label,
      description: setting.description,
      type: setting.type,
      defaultValue: setting.defaultValue,
      value: getExtensionSettingValue(
        manifest.id,
        setting.id,
        setting.defaultValue,
      ),
      options: setting.options?.map((option) => ({ ...option })),
    })),
  };
}

const extensions: import("@yard-core").YardExtensionDefinition[] = [
  { manifest, registerCommands: context => registerCommands(context, new DbSoundShelfStore()) },
  { manifest: makePackManifest, registerCommands: registerMakePackCommands },
  { manifest: dropRulesManifest, registerCommands: registerDropRulesCommands },
  { manifest: folderJanitorManifest, registerCommands: registerFolderJanitorCommands },
  { manifest: libraryGathererManifest, registerCommands: registerLibraryGathererCommands },
  { manifest: smartCollectionsManifest, registerCommands: registerSmartCollectionsCommands },
];

export function registerAllExtensions() {
  for (const extension of extensions) {
    if (!extensionRegistry.has(extension.manifest.id)) extensionRegistry.register(extension);
  }
}

export function listRegisteredExtensionGridItems(): ExtensionGridItem[] {
  registerAllExtensions();
  return extensionRegistry.listManifests().map(toGridItem);
}

export function getRegisteredExtensionGridItem(
  extensionId: string,
): ExtensionGridItem | null {
  registerAllExtensions();

  const registeredExtension = extensionRegistry.get(extensionId);
  if (!registeredExtension) {
    return null;
  }

  return toGridItem(registeredExtension.manifest);
}

export function isExtensionEnabled(extensionId: string) {
  return getExtensionEnabled(extensionId);
}

export function updateExtensionEnabled(
  extensionId: string,
  enabled: boolean,
): ExtensionGridItem | null {
  registerAllExtensions();

  const extension = extensionRegistry.get(extensionId);
  if (!extension) {
    return null;
  }

  setExtensionEnabled(extensionId, enabled);
  return toGridItem(extension.manifest);
}
