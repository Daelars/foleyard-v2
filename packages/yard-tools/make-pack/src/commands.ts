import {
  createYardUiIntent,
  defineYardCommandInputSchema,
  YardCommandValidationError,
  type YardExtensionContext,
} from "yard-core";
import { COMMAND_DEFINITIONS } from "./command-definitions";

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
  const def = (id: string) => COMMAND_DEFINITIONS.find((c) => c.id === id)!;
  context.services.commands.register({
    ...def("make-pack.from-selection"),
    inputSchema: makePackInputSchema,
    handler: () => runMakePack(context, "selection"),
  });

  context.services.commands.register({
    ...def("make-pack.from-shelf"),
    inputSchema: makePackInputSchema,
    handler: () => runMakePack(context, "shelf"),
  });

  context.services.commands.register({
    ...def("make-pack.from-recent"),
    inputSchema: makePackInputSchema,
    handler: () => runMakePack(context, "recent"),
  });
}
