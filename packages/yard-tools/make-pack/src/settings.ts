import type { YardSetting } from "yard-core";

export const settings: YardSetting[] = [
  {
    id: "default-format",
    label: "Default output format",
    description: "Create packs as a folder or a zip archive.",
    type: "select",
    defaultValue: "folder",
    options: [
      { label: "Folder", value: "folder" },
      { label: "Zip", value: "zip" },
    ],
  },
  {
    id: "include-manifest",
    label: "Include manifest",
    description: "Write a manifest.json file with source file metadata.",
    type: "boolean",
    defaultValue: true,
  },
];
