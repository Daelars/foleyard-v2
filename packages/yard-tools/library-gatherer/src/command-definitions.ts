import { defineYardCommand, type YardCommand } from "yard-core";

/** Single source of command metadata for Library Gatherer. Contract: internal. */
export const COMMAND_DEFINITIONS: YardCommand[] = [
  defineYardCommand({
    id: "library-gatherer.preview-gather",
    title: "Preview Library Gather",
    description: "Preview sounds that would be gathered into the main library.",
    scope: "global",
    executionOwner: "extension-host",
    requiredCapabilities: ["gather.preview"],
    inputRef: "gather-options",
    docsId: "commands",
  }),
  defineYardCommand({
    id: "library-gatherer.gather",
    title: "Gather Library",
    description: "Copy sounds from multiple folders into one library folder.",
    scope: "global",
    executionOwner: "extension-host",
    requiredCapabilities: ["gather.write"],
    inputRef: "gather-options",
    docsId: "commands",
  }),
];
