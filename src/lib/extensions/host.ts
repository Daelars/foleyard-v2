import { createExtensionServices, getLibraryRoots } from "@/lib/db";
import { resolveReadablePath, resolveWritablePath } from "@/lib/filesystem-boundary";
import { YardExtensionHost } from "@yard-core";
import {
  isExtensionEnabled,
  registerAllExtensions,
} from "@/lib/extensions/registry";
import { extensionRegistry } from "@/lib/extensions/runtime";
import { getExtensionSettingValue } from "@/lib/extensions/settings-store";

export function createAppExtensionHost(destinationGrant?: string, onProgress?: (completed: number, total: number) => void) {
  registerAllExtensions();

  return new YardExtensionHost({
    registry: extensionRegistry,
    isEnabled: isExtensionEnabled,
    getSettingValue: getExtensionSettingValue,
    services: {
      ...createExtensionServices(),
      scanProgress: onProgress ? { report: onProgress } : undefined,
      filesystem: {
        resolveReadablePath: (candidate, allowRoot = true) => resolveReadablePath(candidate, getLibraryRoots(), { allowRoot }),
        resolveWritablePath: (candidate) => resolveWritablePath(candidate, destinationGrant ?? ""),
      },
    },
  });
}
