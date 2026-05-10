import type { YardExtensionManifest } from "yard-core";

import { permissions } from "./permissions";
import { settings } from "./settings";

export const manifest: YardExtensionManifest = {
  id: "library-gatherer",
  name: "Library Gatherer",
  provider: "Foleyard",
  version: "1.0.0",
  description:
    "Pull sounds from scattered folders, drives, packs, and project folders into one main Foleyard library.",
  category: "utility",
  permissions,
  commands: [
    {
      id: "library-gatherer.preview-gather",
      title: "Preview Library Gather",
      description: "Preview sounds that would be gathered into the main library.",
      scope: "global",
    },
    {
      id: "library-gatherer.gather",
      title: "Gather Library",
      description: "Copy sounds from multiple folders into one library folder.",
      scope: "global",
    },
  ],
  settings,
  surfaces: ["settings"],
};
