import type { YardExtensionManifest } from "yard-core";

import { COMMAND_DEFINITIONS } from "./command-definitions";
import { permissions } from "./permissions";
import { settings } from "./settings";

export const manifest: YardExtensionManifest = {
  id: "make-pack",
  name: "Make Pack",
  provider: "Foleyard",
  version: "1.0.0",
  description:
    "Turn selected sounds, shelf sounds, or recently used sounds into a clean folder or zip.",
  category: "export",
  permissions,
  commands: [...COMMAND_DEFINITIONS],
  settings,
  surfaces: ["context-menu", "sidebar", "selection-actions"],
};
