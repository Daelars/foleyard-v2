import type { YardSetting } from "yard-core";

export const settings: YardSetting[] = [
  {
    id: "safeMode",
    label: "Safe mode",
    description: "Require confirmation before changing files.",
    type: "boolean",
    defaultValue: true
  }
];
