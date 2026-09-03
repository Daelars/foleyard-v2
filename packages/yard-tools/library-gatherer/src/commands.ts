import {
  createYardUiIntent,
  YardCommandValidationError,
  type YardExtensionContext,
} from "yard-core";

import { createService } from "./service";
import type { GatherOptions } from "./types";

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
  context.services.commands.register({
    id: "library-gatherer.preview-gather",
    title: "Preview Library Gather",
    description: "Preview sounds that would be gathered into the main library.",
    scope: "global",
    handler: () => {
      const options = getGatherOptions(context);
      return options ? createService(context).preview(options) : openGatherIntent();
    },
  });

  context.services.commands.register({
    id: "library-gatherer.gather",
    title: "Gather Library",
    description: "Copy sounds from multiple folders into one library folder.",
    scope: "global",
    handler: () => {
      const options = getGatherOptions(context);
      return options ? createService(context).gather(options) : openGatherIntent();
    },
  });
}
