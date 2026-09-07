import { defineYardCommand, type YardCommand } from "yard-core";

/** Single source of command metadata for Smart Collections. Contract: internal. */
export const COMMAND_DEFINITIONS: YardCommand[] = [
  defineYardCommand({
    id: "smart-collections.save-search",
    title: "Save Search as Smart Collection",
    description: "Save the current search query as a smart collection.",
    scope: "global",
    executionOwner: "extension-host",
    requiredCapabilities: ["collections.write"],
    inputRef: "save-search-options",
    docsId: "commands",
  }),
];
