import type { YardExtensionManifest } from "@yard-core";

import type { ExtensionGridItem } from "@/components/ExtensionGrid";
import { getExtensionEnabled, setExtensionEnabled } from "@/lib/db";
import { getExtensionSettingValue } from "@/lib/extensions/settings-store";

import { extensionRegistry } from "./runtime";

import {
  createService,
  manifest,
  registerCommands,
} from "@foleyard/sound-shelf";
import {
  createService as createMakePackService,
  manifest as makePackManifest,
  registerCommands as registerMakePackCommands,
} from "@foleyard/make-pack";
import {
  createService as createDropRulesService,
  manifest as dropRulesManifest,
  registerCommands as registerDropRulesCommands,
} from "@foleyard/drop-rules";
import {
  createService as createFolderJanitorService,
  manifest as folderJanitorManifest,
  registerCommands as registerFolderJanitorCommands,
} from "@foleyard/folder-janitor";
import {
  createService as createLibraryGathererService,
  manifest as libraryGathererManifest,
  registerCommands as registerLibraryGathererCommands,
} from "@foleyard/library-gatherer";

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
    commands: manifest.commands.map((command) => command.title),
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

export function registerAllExtensions() {
  try {
    extensionRegistry.register({
      manifest,
      registerCommands,
      createService,
    });
  } catch {
    // Extension is already registered in this runtime.
  }

  try {
    extensionRegistry.register({
      manifest: makePackManifest,
      registerCommands: registerMakePackCommands,
      createService: createMakePackService,
    });
  } catch {
    // Extension is already registered in this runtime.
  }

  try {
    extensionRegistry.register({
      manifest: dropRulesManifest,
      registerCommands: registerDropRulesCommands,
      createService: createDropRulesService,
    });
  } catch {
    // Extension is already registered in this runtime.
  }

  try {
    extensionRegistry.register({
      manifest: folderJanitorManifest,
      registerCommands: registerFolderJanitorCommands,
      createService: createFolderJanitorService,
    });
  } catch {
    // Extension is already registered in this runtime.
  }

  try {
    extensionRegistry.register({
      manifest: libraryGathererManifest,
      registerCommands: registerLibraryGathererCommands,
      createService: createLibraryGathererService,
    });
  } catch {
    // Extension is already registered in this runtime.
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
