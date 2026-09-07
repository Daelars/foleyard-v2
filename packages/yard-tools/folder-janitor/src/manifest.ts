import type { YardExtensionManifest } from "yard-core";

import { COMMAND_DEFINITIONS } from "./command-definitions";
import { permissions } from "./permissions";
import { settings } from "./settings";

export const manifest: YardExtensionManifest = {
  id: "folder-janitor",
  name: "Folder Janitor",
  provider: "Foleyard",
  version: "1.0.0",
  description:
    "Find duplicate sounds, broken files, empty folders, tiny junk files, unusual formats, and general library mess.",
  category: "cleanup",
  permissions,
  commands: [...COMMAND_DEFINITIONS],
  settings,
  surfaces: ["settings"],
};
