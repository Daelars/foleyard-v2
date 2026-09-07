import {
  createYardUiIntent,
  defineYardCommandInputSchema,
  YardCommandValidationError,
  type YardExtensionContext,
} from "yard-core";
import { COMMAND_DEFINITIONS } from "./command-definitions";

import { createService } from "./service";
import type { GatherOptions } from "./types";

export const gatherInputSchema =
  defineYardCommandInputSchema(validateGatherInput);

export function validateGatherInput(input: unknown): string | null {
  if (input === undefined) {
    return null;
  }

  const candidate = input as Partial<GatherOptions>;
  if (
    !Array.isArray(candidate.sourceDirectories) ||
    candidate.sourceDirectories.length === 0
  ) {
    return "sourceDirectories array is required";
  }
  if (!candidate.destinationDirectory) {
    return "destinationDirectory is required";
  }

  return null;
}

function getGatherOptions(context: YardExtensionContext): GatherOptions | null {
  if (context.input === undefined) {
    return null;
  }

  const input = context.input as Partial<GatherOptions>;
  if (!Array.isArray(input.sourceDirectories) || input.sourceDirectories.length === 0) {
    throw new YardCommandValidationError("sourceDirectories array is required");
  }
  if (!input.destinationDirectory) {
    throw new YardCommandValidationError("destinationDirectory is required");
  }

  const preserveFolderNames = context.services.settings?.get(
    "preserve-folder-names",
  );
  const skipDuplicates = context.services.settings?.get("skip-duplicates");

  return {
    sourceDirectories: input.sourceDirectories,
    destinationDirectory: input.destinationDirectory,
    preserveFolderNames:
      typeof preserveFolderNames === "boolean" ? preserveFolderNames : true,
    skipDuplicates: typeof skipDuplicates === "boolean" ? skipDuplicates : true,
  };
}

function openGatherIntent() {
  return createYardUiIntent("library-gatherer.open", {});
}

export function registerCommands(context: YardExtensionContext) {
  const def = (id: string) => COMMAND_DEFINITIONS.find((c) => c.id === id)!;
  context.services.commands.register({
    ...def("library-gatherer.preview-gather"),
    inputSchema: gatherInputSchema,
    handler: () => {
      const options = getGatherOptions(context);
      return options ? createService(context).preview(options) : openGatherIntent();
    },
  });

  context.services.commands.register({
    ...def("library-gatherer.gather"),
    inputSchema: gatherInputSchema,
    handler: () => {
      const options = getGatherOptions(context);
      return options ? createService(context).gather(options) : openGatherIntent();
    },
  });
}
