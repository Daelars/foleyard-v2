import type { YardExtensionManifest } from "yard-core";

import { COMMAND_DEFINITIONS } from "./command-definitions";
import { permissions } from "./permissions";
import { settings } from "./settings";

export const manifest: YardExtensionManifest = {
  id: "smart-collections",
  name: "Smart Collections",
  provider: "Foleyard",
  version: "1.0.0",
  description:
    "Save any search as a live-updating collection. Files matching the search criteria appear automatically.",
  category: "utility",
  permissions,
  commands: [...COMMAND_DEFINITIONS],
  settings,
  surfaces: ["sidebar", "settings"],
};
