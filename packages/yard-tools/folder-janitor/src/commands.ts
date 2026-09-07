import {
  createYardUiIntent,
  defineYardCommandInputSchema,
  YardCommandValidationError,
  type YardExtensionContext,
} from "yard-core";
import { COMMAND_DEFINITIONS } from "./command-definitions";

import { createService } from "./service";
import type { JanitorFile, JanitorScanOptions } from "./types";

export const janitorScanInputSchema = defineYardCommandInputSchema(
  validateJanitorScanInput,
);

export const deleteFoldersInputSchema = defineYardCommandInputSchema(
  validateDeleteFoldersInput,
);

export function validateJanitorScanInput(input: unknown): string | null {
  if (input === undefined) {
    return null;
  }

  const candidate = input as Partial<JanitorCommandInput> | undefined;
  if (!Array.isArray(candidate?.files) || !Array.isArray(candidate.libraryRoots)) {
    return "files and libraryRoots arrays are required";
  }

  return null;
}

export function validateDeleteFoldersInput(input: unknown): string | null {
  const candidate = input as
    | { paths?: string[]; libraryRoots?: string[] }
    | undefined;
  if (!candidate?.paths?.length || !candidate.libraryRoots?.length) {
    return "paths and libraryRoots arrays are required";
  }

  return null;
}

type JanitorCommandInput = {
  files: JanitorFile[];
  libraryRoots: string[];
};

function getScanOptions(
  context: YardExtensionContext,
): JanitorScanOptions | null {
  const input = context.input as Partial<JanitorCommandInput> | undefined;
  if (!Array.isArray(input?.files) || !Array.isArray(input.libraryRoots)) {
    return null;
  }

  const allowedFormatsValue = context.services.settings?.get("allowed-formats");
  const tinyThresholdValue = context.services.settings?.get(
    "tiny-file-threshold-bytes",
  );

  return {
    files: input.files,
    libraryRoots: input.libraryRoots,
    onProgress: context.services.scanProgress?.report,
    tinyFileThresholdBytes:
      typeof tinyThresholdValue === "number" ? tinyThresholdValue : 1024,
    allowedFormats:
      typeof allowedFormatsValue === "string"
        ? allowedFormatsValue.split(",").map((format) => format.trim())
        : undefined,
  };
}

export function registerCommands(context: YardExtensionContext) {
  const def = (id: string) => COMMAND_DEFINITIONS.find((c) => c.id === id)!;
  context.services.commands.register({
    ...def("folder-janitor.scan-library"),
    inputSchema: janitorScanInputSchema,
    handler: () => {
      const scanOptions = getScanOptions(context);
      return scanOptions
        ? createService(context).scan(scanOptions)
        : createYardUiIntent("folder-janitor.open-scan", {
            target: "library" as const,
          });
    },
  });

  context.services.commands.register({
    ...def("folder-janitor.scan-folder"),
    inputSchema: janitorScanInputSchema,
    handler: () => {
      const scanOptions = getScanOptions(context);
      return scanOptions
        ? createService(context).scan(scanOptions)
        : createYardUiIntent("folder-janitor.open-scan", {
            target: "folder" as const,
            folderPath: context.selection.folderPath,
          });
    },
  });

  context.services.commands.register({
    ...def("folder-janitor.remove-files"),
    handler: () => createService(context).removeFiles(context.selection.fileIds),
  });

  context.services.commands.register({
    ...def("folder-janitor.delete-folders"),
    inputSchema: deleteFoldersInputSchema,
    handler: () => {
      const input = context.input as
        | { paths?: string[]; libraryRoots?: string[] }
        | undefined;
      if (!input?.paths?.length || !input.libraryRoots?.length) {
        throw new YardCommandValidationError(
          "paths and libraryRoots arrays are required",
        );
      }
      return createService(context).deleteFolders(input.paths);
    },
  });
}
