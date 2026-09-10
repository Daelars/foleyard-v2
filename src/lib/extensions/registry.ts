import type { YardExtensionManifest } from "@yard-core";

import type { ExtensionGridItem } from "@/lib/extensions/types";
import { getExtensionEnabled, setExtensionEnabled } from "@/lib/db";
import { getExtensionSettingValue } from "@/lib/extensions/settings-store";

import { extensionRegistry } from "./runtime";

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

/**
 * All six v1 tools have retired to their v2 ports; the table stays as
 * the (now empty) registration point so the v1 routes fail closed
 * (unknown extension, 404) instead of breaking callers. See
 * `docs/extensions-v2-migration.md` for the retirement mechanics.
 */
const extensions: import("@yard-core").YardExtensionDefinition[] = [];

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
