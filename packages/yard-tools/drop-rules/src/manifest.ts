import type { YardExtensionManifest } from "yard-core";

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
  commands: [
    {
      id: "drop-rules.open-settings",
      title: "Configure Drop Rules",
      description: "Open the Drop Rules settings.",
      scope: "global",
    },
    {
      id: "drop-rules.preview",
      title: "Preview Drop Rules",
      description: "Preview the file actions that Drop Rules would perform.",
      scope: "drop",
      requiresSelection: true,
    },
    {
      id: "drop-rules.apply",
      title: "Apply Drop Rules",
      description: "Copy and rename dropped sounds using the configured rules.",
      scope: "drop",
      requiresSelection: true,
    },
    {
      id: "drop-rules.prepare-drag",
      title: "Prepare Drag",
      description: "Prepare one sound for drag-out using the configured rules.",
      scope: "drop",
      requiresSelection: true,
    },
  ],
  settings,
  surfaces: ["settings"],
};
