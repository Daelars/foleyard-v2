import type { YardExtensionManifest } from "yard-core";

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
  commands: [
    {
      id: "smart-collections.save-search",
      title: "Save Search as Smart Collection",
      description: "Save the current search query as a smart collection.",
      scope: "global",
    },
  ],
  settings,
  surfaces: ["sidebar", "settings"],
};
