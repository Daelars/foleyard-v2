import { createDragStage } from "./staging";
import os from "node:os";
import path from "node:path";

import {
  createYardUiIntent,
  defineYardCommandInputSchema,
  YardCommandValidationError,
  type YardExtensionContext,
} from "yard-core";
import { COMMAND_DEFINITIONS } from "./command-definitions";

import { createService } from "./service";
import type { DropRuleOptions, PrepareDragOptions } from "./types";

export const dropRuleInputSchema =
  defineYardCommandInputSchema(validateDropRuleInput);

export const prepareDragInputSchema = defineYardCommandInputSchema(
  validatePrepareDragInput,
);

export function validateDropRuleInput(input: unknown): string | null {
  const candidate = input as Partial<DropRuleOptions> | undefined;
  if (!candidate?.targetDirectory || !Array.isArray(candidate.files)) {
    return "targetDirectory and files are required";
  }

  return null;
}

export function validatePrepareDragInput(input: unknown): string | null {
  const candidate = input as Partial<PrepareDragOptions> | undefined;
  if (!candidate?.file) {
    return "file is required";
  }

  return null;
}

function booleanSetting(
  context: YardExtensionContext,
  settingId: string,
  defaultValue: boolean,
) {
  const value = context.services.settings?.get(settingId);
  return typeof value === "boolean" ? value : defaultValue;
}

function stringSetting(
  context: YardExtensionContext,
  settingId: string,
  defaultValue: string,
) {
  const value = context.services.settings?.get(settingId);
  return typeof value === "string" ? value : defaultValue;
}

function getRuleOptions(context: YardExtensionContext): DropRuleOptions {
  const input = context.input as Partial<DropRuleOptions> | undefined;
  if (!input?.targetDirectory || !Array.isArray(input.files)) {
    throw new YardCommandValidationError(
      "targetDirectory and files are required",
    );
  }

  return {
    targetDirectory: input.targetDirectory,
    files: input.files,
    copyOnDrop: booleanSetting(context, "copy-on-drop", true),
    renameOnDrop: booleanSetting(context, "rename-on-drop", true),
    renamePattern: stringSetting(context, "rename-pattern", "{index}-{name}{ext}"),
    markUsed: booleanSetting(context, "mark-used", true),
  };
}

async function getPrepareDragOptions(
  context: YardExtensionContext,
): Promise<PrepareDragOptions> {
  const input = context.input as Partial<PrepareDragOptions> | undefined;
  if (!input?.file) {
    throw new YardCommandValidationError("file is required");
  }

  const configuredDirectory = stringSetting(context, "drag-out-folder", "");

  return {
    stagingDirectory: await createDragStage(input.stagingDirectory || (configuredDirectory.trim() ? configuredDirectory : path.join(os.tmpdir(), "foleyard-drop-rules"))),
    file: input.file,
    copyOnDrop: booleanSetting(context, "copy-on-drop", true),
    renameOnDrop: booleanSetting(context, "rename-on-drop", true),
    renamePattern: stringSetting(context, "rename-pattern", "{index}-{name}{ext}"),
    markUsed: booleanSetting(context, "mark-used", true),
  };
}

export function registerCommands(context: YardExtensionContext) {
  const def = (id: string) => COMMAND_DEFINITIONS.find((c) => c.id === id)!;
  context.services.commands.register({
    ...def("drop-rules.open-settings"),
    handler: () => createYardUiIntent("drop-rules.open-settings", {}),
  });

  context.services.commands.register({
    ...def("drop-rules.preview"),
    inputSchema: dropRuleInputSchema,
    handler: () => createService(context).preview(getRuleOptions(context)),
  });

  context.services.commands.register({
    ...def("drop-rules.apply"),
    inputSchema: dropRuleInputSchema,
    handler: () => createService(context).apply(getRuleOptions(context)),
  });

  context.services.commands.register({
    ...def("drop-rules.prepare-drag"),
    inputSchema: prepareDragInputSchema,
    handler: async () =>
      createService(context).prepareDrag(await getPrepareDragOptions(context)),
  });
}
