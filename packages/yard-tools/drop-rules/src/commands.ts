import { createDragStage } from "./staging";
import os from "node:os";
import path from "node:path";

import {
  createYardUiIntent,
  YardCommandValidationError,
  type YardExtensionContext,
} from "yard-core";

import { createService } from "./service";
import type { DropRuleOptions, PrepareDragOptions } from "./types";

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
  context.services.commands.register({
    id: "drop-rules.open-settings",
    title: "Configure Drop Rules",
    description: "Open the Drop Rules settings.",
    scope: "global",
    handler: () => createYardUiIntent("drop-rules.open-settings", {}),
  });

  context.services.commands.register({
    id: "drop-rules.preview",
    title: "Preview Drop Rules",
    description: "Preview the file actions that Drop Rules would perform.",
    scope: "drop",
    requiresSelection: true,
    handler: () => createService(context).preview(getRuleOptions(context)),
  });

  context.services.commands.register({
    id: "drop-rules.apply",
    title: "Apply Drop Rules",
    description: "Copy and rename dropped sounds using the configured rules.",
    scope: "drop",
    requiresSelection: true,
    handler: () => createService(context).apply(getRuleOptions(context)),
  });

  context.services.commands.register({
    id: "drop-rules.prepare-drag",
    title: "Prepare Drag",
    description: "Prepare one sound for drag-out using the configured rules.",
    scope: "drop",
    requiresSelection: true,
    handler: async () =>
      createService(context).prepareDrag(await getPrepareDragOptions(context)),
  });
}
