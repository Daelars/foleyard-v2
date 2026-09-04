import { getLibraryRoots } from "@/lib/db";
import { resolveReadablePath, resolveWritablePath } from "@/lib/filesystem-boundary";
import { YardExtensionHost } from "@yard-core";

import { createExtensionServices } from "@/lib/composition-root";
import {
  isExtensionEnabled,
  registerAllExtensions,
} from "@/lib/extensions/registry";
import { extensionRegistry } from "@/lib/extensions/runtime";
import { getExtensionSettingValue } from "@/lib/extensions/settings-store";

export function createAppExtensionHost(destinationGrant?: string) {
  registerAllExtensions();

  return new YardExtensionHost({
    registry: extensionRegistry,
    isEnabled: isExtensionEnabled,
    getSettingValue: getExtensionSettingValue,
    services: {
      ...createExtensionServices(),
      filesystem: {
        resolveReadablePath: (candidate, allowRoot = true) => resolveReadablePath(candidate, getLibraryRoots(), { allowRoot }),
        resolveWritablePath: (candidate) => resolveWritablePath(candidate, destinationGrant ?? ""),
      },
    },
  });
}
