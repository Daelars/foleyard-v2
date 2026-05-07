import type { YardExtensionManifest } from "yard-core";

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
  commands: [
    {
      id: "sound-shelf.add-selected",
      title: "Add to Shelf",
      description: "Add the selected files to the Sound Shelf scratchpad.",
      scope: "selection",
      requiresSelection: true,
    },
    {
      id: "sound-shelf.remove-selected",
      title: "Remove from Shelf",
      description: "Remove the selected files from the Sound Shelf scratchpad.",
      scope: "selection",
      requiresSelection: true,
    },
    {
      id: "sound-shelf.clear",
      title: "Clear Shelf",
      description: "Remove all files from the Sound Shelf scratchpad.",
      scope: "global",
    },
  ],
  settings,
  surfaces: ["context-menu", "sidebar"],
};
