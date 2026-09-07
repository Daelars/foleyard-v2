import type { YardExtensionManifest } from "yard-core";

import { COMMAND_DEFINITIONS } from "./command-definitions";
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
  commands: [...COMMAND_DEFINITIONS],
  settings,
  surfaces: ["settings"],
};
