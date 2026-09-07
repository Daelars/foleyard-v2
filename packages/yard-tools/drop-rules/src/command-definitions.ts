import { defineYardCommand, type YardCommand } from "yard-core";

/** Single source of command metadata for Drop Rules. Contract: internal. */
export const COMMAND_DEFINITIONS: YardCommand[] = [
  defineYardCommand({
    id: "drop-rules.open-settings",
    title: "Configure Drop Rules",
    description: "Open the Drop Rules settings.",
    scope: "global",
    executionOwner: "extension-host",
    requiredCapabilities: ["drop.configure"],
    docsId: "commands",
  }),
  defineYardCommand({
    id: "drop-rules.preview",
    title: "Preview Drop Rules",
    description: "Preview the file actions that Drop Rules would perform.",
    scope: "drop",
    requiresSelection: true,
    executionOwner: "extension-host",
    requiredCapabilities: ["drop.apply"],
    inputRef: "drop-rule-options",
    docsId: "commands",
  }),
  defineYardCommand({
    id: "drop-rules.apply",
    title: "Apply Drop Rules",
    description: "Copy and rename dropped sounds using the configured rules.",
    scope: "drop",
    requiresSelection: true,
    executionOwner: "extension-host",
    requiredCapabilities: ["drop.apply"],
    inputRef: "drop-rule-options",
    docsId: "commands",
  }),
  defineYardCommand({
    id: "drop-rules.prepare-drag",
    title: "Prepare Drag",
    description: "Prepare one sound for drag-out using the configured rules.",
    scope: "drop",
    requiresSelection: true,
    executionOwner: "extension-host",
    requiredCapabilities: ["drop.apply"],
    inputRef: "prepare-drag-options",
    docsId: "commands",
  }),
];
