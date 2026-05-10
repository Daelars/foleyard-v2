import type { YardExtensionManifest } from "yard-core";

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
  commands: [
    {
      id: "make-pack.from-selection",
      title: "Make Pack from Selection",
      description: "Create a pack from the selected sounds.",
      scope: "selection",
      requiresSelection: true,
    },
    {
      id: "make-pack.from-shelf",
      title: "Make Pack from Shelf",
      description: "Create a pack from Sound Shelf items.",
      scope: "global",
    },
    {
      id: "make-pack.from-recent",
      title: "Make Pack from Recent Sounds",
      description: "Create a pack from recently previewed sounds.",
      scope: "global",
    },
  ],
  settings,
  surfaces: ["context-menu", "sidebar", "selection-actions"],
};
