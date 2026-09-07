import { defineYardCommand, type YardCommand } from "yard-core";

/** Single source of command metadata for Folder Janitor. Contract: internal. */
export const COMMAND_DEFINITIONS: YardCommand[] = [
  defineYardCommand({
    id: "folder-janitor.scan-library",
    title: "Scan Library Mess",
    description: "Create a cleanup report for the current sound library.",
    scope: "global",
    executionOwner: "extension-host",
    requiredCapabilities: ["janitor.scan"],
    inputRef: "janitor-scan-options",
    resultRef: "janitor-scan-report",
    docsId: "commands",
  }),
  defineYardCommand({
    id: "folder-janitor.scan-folder",
    title: "Scan Folder Mess",
    description: "Create a cleanup report for the current folder.",
    scope: "folder",
    executionOwner: "extension-host",
    requiredCapabilities: ["janitor.scan"],
    inputRef: "janitor-scan-options",
    resultRef: "janitor-scan-report",
    docsId: "commands",
  }),
  defineYardCommand({
    id: "folder-janitor.remove-files",
    title: "Remove Files from Index",
    description: "Mark selected files as removed from the library index.",
    scope: "selection",
    requiresSelection: true,
    executionOwner: "extension-host",
    requiredCapabilities: ["library.write"],
    docsId: "commands",
  }),
  defineYardCommand({
    id: "folder-janitor.delete-folders",
    title: "Delete Empty Folders",
    description: "Delete the supplied empty folders.",
    scope: "global",
    destructive: true,
    executionOwner: "extension-host",
    requiredCapabilities: ["files.delete"],
    inputRef: "delete-folders-options",
    docsId: "commands",
  }),
];
