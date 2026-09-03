import { YardExtensionHost } from "@yard-core";

import { createExtensionServices } from "@/lib/composition-root";
import {
  isExtensionEnabled,
  registerAllExtensions,
} from "@/lib/extensions/registry";
import { extensionRegistry } from "@/lib/extensions/runtime";
import { getExtensionSettingValue } from "@/lib/extensions/settings-store";

export function createAppExtensionHost() {
  registerAllExtensions();

  return new YardExtensionHost({
    registry: extensionRegistry,
    isEnabled: isExtensionEnabled,
    getSettingValue: getExtensionSettingValue,
    services: createExtensionServices(),
  });
}
