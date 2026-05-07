import type { YardExtensionManifest } from "yard-core";

export const manifest: YardExtensionManifest = {
  id: "example-extension",
  name: "Example Extension",
  provider: "Foleyard",
  version: "1.0.0",
  description: "Adds a small useful workflow to Foleyard.",
  category: "workflow",
  permissions: ["library:read", "files:read"],
  commands: [
    {
      id: "example-extension.run",
      title: "Run Example Extension",
      description: "Runs the extension on the current selection.",
      scope: "selection",
      requiresSelection: true
    }
  ],
  settings: [
    {
      id: "safeMode",
      label: "Safe mode",
      description: "Require confirmation before changing files.",
      type: "boolean",
      defaultValue: true
    }
  ],
  surfaces: ["command-palette", "context-menu"]
};
