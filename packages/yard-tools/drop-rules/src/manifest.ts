import type { YardExtensionManifest } from "yard-core";

import { COMMAND_DEFINITIONS } from "./command-definitions";
import { permissions } from "./permissions";
import { settings } from "./settings";

export const manifest: YardExtensionManifest = {
  id: "drop-rules",
  name: "Drop Rules",
  provider: "Foleyard",
  version: "1.0.0",
  description:
    "Control what happens when a sound leaves Foleyard: copy, rename, and mark sounds as used.",
  category: "drop",
  permissions,
  commands: [...COMMAND_DEFINITIONS],
  settings,
  surfaces: ["settings"],
};
