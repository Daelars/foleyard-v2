import { defineYardCommand, type YardCommand } from "yard-core";

/** Single source of command metadata for Make Pack. Contract: internal. */
export const COMMAND_DEFINITIONS: YardCommand[] = [
  defineYardCommand({
    id: "make-pack.from-selection",
    title: "Make Pack from Selection",
    description: "Create a pack from the selected sounds.",
    scope: "selection",
    requiresSelection: true,
    executionOwner: "extension-host",
    requiredCapabilities: ["pack.export"],
    inputRef: "make-pack-options",
    resultRef: "make-pack-result",
    docsId: "commands",
  }),
  defineYardCommand({
    id: "make-pack.from-shelf",
    title: "Make Pack from Shelf",
    description: "Create a pack from Sound Shelf items.",
    scope: "global",
    executionOwner: "extension-host",
    requiredCapabilities: ["pack.export"],
    inputRef: "make-pack-options",
    resultRef: "make-pack-result",
    docsId: "commands",
  }),
  defineYardCommand({
    id: "make-pack.from-recent",
    title: "Make Pack from Recent Sounds",
    description: "Create a pack from recently previewed sounds.",
    scope: "global",
    executionOwner: "extension-host",
    requiredCapabilities: ["pack.export"],
    inputRef: "make-pack-options",
    resultRef: "make-pack-result",
    docsId: "commands",
  }),
];
