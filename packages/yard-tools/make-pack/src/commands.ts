import {
  createYardUiIntent,
  defineYardCommandInputSchema,
  YardCommandValidationError,
  type YardExtensionContext,
} from "yard-core";

import { createService } from "./service";
import type { MakePackOptions, MakePackSource } from "./types";

export const makePackInputSchema = defineYardCommandInputSchema(
  validateMakePackInput,
);

export function validateMakePackInput(input: unknown): string | null {
  if (input === undefined) {
    return null;
  }

  if (typeof input !== "object" || input === null) {
    return "No sounds found for that pack source";
  }

  const candidate = input as Partial<MakePackOptions>;
  if (!Array.isArray(candidate.files) || candidate.files.length === 0) {
    return "No sounds found for that pack source";
  }
  if (!candidate.destinationDirectory) {
    return "destinationDirectory is required";
  }

  return null;
}

function runMakePack(context: YardExtensionContext, source: MakePackSource) {
  if (context.input === undefined) {
    return createYardUiIntent("make-pack.open", {
      source,
      fileIds: source === "selection" ? context.selection.fileIds : [],
    });
  }

  const input = context.input as Partial<MakePackOptions>;
  if (!Array.isArray(input.files) || input.files.length === 0) {
    throw new YardCommandValidationError("No sounds found for that pack source");
  }
  if (!input.destinationDirectory) {
    throw new YardCommandValidationError("destinationDirectory is required");
  }

  const defaultFormat = context.services.settings?.get("default-format");
  const includeManifest = context.services.settings?.get("include-manifest");

  return createService(context).createPack({
    source,
    files: input.files,
    destinationDirectory: input.destinationDirectory,
    packName: input.packName,
    outputFormat:
      input.outputFormat ??
      (defaultFormat === "zip" || defaultFormat === "folder"
        ? defaultFormat
        : "folder"),
    includeManifest:
      typeof includeManifest === "boolean" ? includeManifest : true,
  });
}

export function registerCommands(context: YardExtensionContext) {
  context.services.commands.register({
    id: "make-pack.from-selection",
    title: "Make Pack from Selection",
    description: "Create a pack from the selected sounds.",
    scope: "selection",
    requiresSelection: true,
    inputSchema: makePackInputSchema,
    handler: () => runMakePack(context, "selection"),
  });

  context.services.commands.register({
    id: "make-pack.from-shelf",
    title: "Make Pack from Shelf",
    description: "Create a pack from Sound Shelf items.",
    scope: "global",
    inputSchema: makePackInputSchema,
    handler: () => runMakePack(context, "shelf"),
  });

  context.services.commands.register({
    id: "make-pack.from-recent",
    title: "Make Pack from Recent Sounds",
    description: "Create a pack from recently previewed sounds.",
    scope: "global",
    inputSchema: makePackInputSchema,
    handler: () => runMakePack(context, "recent"),
  });
}
