import type { YardExtensionManifest } from "yard-core";

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
  commands: [
    {
      id: "folder-janitor.scan-library",
      title: "Scan Library Mess",
      description: "Create a cleanup report for the current sound library.",
      scope: "global",
    },
    {
      id: "folder-janitor.scan-folder",
      title: "Scan Folder Mess",
      description: "Create a cleanup report for the current folder.",
      scope: "folder",
    },
    {
      id: "folder-janitor.remove-files",
      title: "Remove Files from Index",
      description: "Mark selected files as removed from the library index.",
      scope: "selection",
      requiresSelection: true,
    },
    {
      id: "folder-janitor.delete-folders",
      title: "Delete Empty Folders",
      description: "Delete the supplied empty folders.",
      scope: "global",
      destructive: true,
    },
  ],
  settings,
  surfaces: ["settings"],
};
