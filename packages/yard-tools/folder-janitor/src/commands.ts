import {
  createYardUiIntent,
  defineYardCommandInputSchema,
  YardCommandValidationError,
  type YardExtensionContext,
} from "yard-core";

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
  context.services.commands.register({
    id: "folder-janitor.scan-library",
    title: "Scan Library Mess",
    description: "Create a cleanup report for the current sound library.",
    scope: "global",
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
    id: "folder-janitor.scan-folder",
    title: "Scan Folder Mess",
    description: "Create a cleanup report for the current folder.",
    scope: "folder",
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
    id: "folder-janitor.remove-files",
    title: "Remove Files from Index",
    description: "Mark selected files as removed from the library index.",
    scope: "selection",
    requiresSelection: true,
    handler: () => createService(context).removeFiles(context.selection.fileIds),
  });

  context.services.commands.register({
    id: "folder-janitor.delete-folders",
    title: "Delete Empty Folders",
    description: "Delete the supplied empty folders.",
    scope: "global",
    destructive: true,
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
