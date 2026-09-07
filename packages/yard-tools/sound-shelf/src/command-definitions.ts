import { defineYardCommand, type YardCommand } from "yard-core";

/**
 * Single source of command metadata for Sound Shelf.
 * Feature status: shipped. Contract: internal.
 * Manifest declarations and handler registration both consume this table.
 */
export const COMMAND_DEFINITIONS: YardCommand[] = [
  defineYardCommand({
    id: "sound-shelf.add-selected",
    title: "Add to Shelf",
    description: "Add the selected files to the Sound Shelf scratchpad.",
    scope: "selection",
    requiresSelection: true,
    executionOwner: "extension-host",
    requiredCapabilities: ["shelf.write"],
    docsId: "commands",
  }),
  defineYardCommand({
    id: "sound-shelf.remove-selected",
    title: "Remove from Shelf",
    description: "Remove the selected files from the Sound Shelf scratchpad.",
    scope: "selection",
    requiresSelection: true,
    executionOwner: "extension-host",
    requiredCapabilities: ["shelf.write"],
    docsId: "commands",
  }),
  defineYardCommand({
    id: "sound-shelf.clear",
    title: "Clear Shelf",
    description: "Remove all files from the Sound Shelf scratchpad.",
    scope: "global",
    executionOwner: "extension-host",
    requiredCapabilities: ["shelf.write"],
    docsId: "commands",
  }),
  defineYardCommand({
    id: "sound-shelf.list",
    title: "List Shelf",
    description: "List the files in the Sound Shelf scratchpad.",
    scope: "global",
    executionOwner: "extension-host",
    requiredCapabilities: ["shelf.read"],
    docsId: "commands",
  }),
];
