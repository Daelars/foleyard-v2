/**
 * Selected-IDs demo extension.
 *
 * Self-contained, sound-shelf-like example over an in-memory array store.
 * No filesystem access, no user files. Imports yard-core only.
 * Feature status: shipped. Contract: internal.
 */

import {
  defineYardCommand,
  describeYardCommand,
  type YardCommand,
  type YardExtensionDefinition,
  type YardExtensionContext,
} from "yard-core";

export const EXTENSION_ID = "selected-ids";

/**
 * COMMAND_DEFINITIONS-style metadata: the single source of truth consumed by
 * both the manifest declaration and handler registration, mirroring
 * packages/yard-tools/sound-shelf/src/command-definitions.ts.
 */
export const COMMAND_DEFINITIONS: YardCommand[] = [
  defineYardCommand({
    id: `${EXTENSION_ID}.add-selected`,
    title: "Add Selected IDs",
    description:
      "Record the supplied file selection into the in-memory store and return it.",
    scope: "selection",
    requiresSelection: true,
    executionOwner: "extension-host",
    requiredCapabilities: ["selected-ids.write"],
    docsId: "commands",
  }),
];

export interface SelectedIdsStore {
  getFileIds(): string[];
  setFileIds(fileIds: string[]): void;
}

export class InMemorySelectedIdsStore implements SelectedIdsStore {
  private fileIds: string[] = [];

  getFileIds(): string[] {
    return [...this.fileIds];
  }

  setFileIds(fileIds: string[]): void {
    this.fileIds = [...fileIds];
  }
}

export function registerCommands(
  context: YardExtensionContext,
  store: SelectedIdsStore,
): void {
  const def = COMMAND_DEFINITIONS[0]!;
  context.services.commands.register({
    ...def,
    handler: () => {
      const ids = [...context.selection.fileIds];
      store.setFileIds(ids);
      return ids;
    },
  });
}

export function createSelectedIdsExtension(
  store: SelectedIdsStore,
): YardExtensionDefinition {
  return {
    manifest: {
      id: EXTENSION_ID,
      name: "Selected IDs Demo",
      provider: "Foleyard",
      version: "1.0.0",
      description:
        "Demo extension that echoes the supplied file selection. In-memory only.",
      category: "utility",
      permissions: ["library:read"],
      commands: [...COMMAND_DEFINITIONS],
    },
    registerCommands: (context: YardExtensionContext) =>
      registerCommands(context, store),
  };
}

/** Shared-metadata projection (no functions), for display or catalog use. */
export function describeSelectedIdsCommand() {
  return describeYardCommand(COMMAND_DEFINITIONS[0]!);
}
