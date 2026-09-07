import type { YardExtensionManifest } from "yard-core";

import { COMMAND_DEFINITIONS } from "./command-definitions";
import { permissions } from "./permissions";
import { settings } from "./settings";

export const manifest: YardExtensionManifest = {
  id: "sound-shelf",
  name: "Sound Shelf",
  provider: "Foleyard",
  version: "1.0.0",
  description:
    "A temporary holding area for maybe sounds while searching. Not favorites, just a short-term scratchpad.",
  category: "utility",
  permissions,
  commands: [...COMMAND_DEFINITIONS],
  settings,
  surfaces: ["context-menu", "sidebar"],
};
