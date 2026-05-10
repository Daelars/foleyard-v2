import type { YardSetting } from "yard-core";

export const settings: YardSetting[] = [
  {
    id: "copy-on-drop",
    label: "Copy on drop",
    description: "Drag a safe prepared copy instead of the source file.",
    type: "boolean",
    defaultValue: true,
  },
  {
    id: "rename-on-drop",
    label: "Rename on drop",
    description: "Apply the rename pattern to files dragged out of Foleyard.",
    type: "boolean",
    defaultValue: true,
  },
  {
    id: "rename-pattern",
    label: "Rename pattern",
    description: "Supports {name}, {index}, {ext}, {format}, {date}, and {time}.",
    type: "string",
    defaultValue: "{index}-{name}{ext}",
  },
  {
    id: "drag-out-folder",
    label: "Prepared drag folder",
    description:
      "Optional staging folder for renamed drag-out copies. Blank uses the system temp folder.",
    type: "path",
    defaultValue: "",
  },
  {
    id: "mark-used",
    label: "Mark used",
    description: "Write a small used-sounds report when sounds leave Foleyard.",
    type: "boolean",
    defaultValue: true,
  },
];
