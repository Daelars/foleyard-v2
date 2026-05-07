import type { YardExtensionManifest } from "@yard-core";

import type { ExtensionGridItem } from "@/components/ExtensionGrid";
import { getExtensionEnabled, setExtensionEnabled } from "@/lib/db";

import { extensionRegistry } from "./runtime";

import {
  createService,
  manifest,
  registerCommands,
} from "@foleyard/sound-shelf";

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
