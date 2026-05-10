import type { YardSetting } from "yard-core";

export const settings: YardSetting[] = [
  {
    id: "preserve-folder-names",
    label: "Preserve folder names",
    description: "Group gathered sounds by source folder name.",
    type: "boolean",
    defaultValue: true,
  },
  {
    id: "skip-duplicates",
    label: "Skip duplicates",
    description: "Skip files that already exist in the target library by name and size.",
    type: "boolean",
    defaultValue: true,
  },
];
