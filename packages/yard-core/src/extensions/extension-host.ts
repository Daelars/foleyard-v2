import type { YardExtensionContext } from "./extension-context";
import { createYardExtensionContext } from "./extension-context";
import { YardCommandRegistry } from "./extension-command-registry";
import type { YardExtensionRegistry } from "./extension-registry";
import { YardPermissionError } from "./vocabulary";
import { isYardUiIntent, type YardUiIntent } from "./vocabulary";
import { YardCommandValidationError } from "./vocabulary";

export type YardExtensionHostFailureReason =
  | "extension-not-found"
  | "extension-disabled"
  | "command-not-found"
  | "validation-failed"
  | "permission-denied"
  | "execution-failed";

export type YardExtensionHostOutcome<T = unknown> =
  | { ok: true; type: "value"; value: T }
  | { ok: true; type: "ui-intent"; intent: YardUiIntent }
  | {
      ok: false;
      reason: YardExtensionHostFailureReason;
      message: string;
    };

export type YardExtensionHostOptions = {
  registry: YardExtensionRegistry;
  isEnabled(extensionId: string): boolean;
  getSettingValue(
    extensionId: string,
    settingId: string,
    defaultValue: unknown,
  ): unknown;
  services?: Omit<YardExtensionContext["services"], "commands" | "settings">;
};

export type ExecuteYardExtensionCommandOptions = {
  extensionId: string;
  commandId: string;
  selection?: {
    fileIds?: string[];
    folderPath?: string;
    collectionId?: string;
  };
  input?: unknown;
};

export class YardExtensionHost {
  constructor(private readonly options: YardExtensionHostOptions) {}

  async execute<T = unknown>(
    request: ExecuteYardExtensionCommandOptions,
  ): Promise<YardExtensionHostOutcome<T>> {
    const extension = this.options.registry.get(request.extensionId);

    if (!extension) {
      return {
        ok: false,
        reason: "extension-not-found",
        message: `Extension "${request.extensionId}" is not registered.`,
      };
    }

    if (!this.options.isEnabled(request.extensionId)) {
      return {
        ok: false,
        reason: "extension-disabled",
        message: `Extension "${request.extensionId}" is disabled.`,
      };
    }

    const commands = new YardCommandRegistry();
    const defaults = new Map(
      (extension.manifest.settings ?? []).map((setting) => [
        setting.id,
        setting.defaultValue,
      ]),
    );
    const context = createYardExtensionContext({
      services: {
        ...this.options.services,
        commands,
        settings: {
          get: <TValue = unknown>(settingId: string) => {
            if (!defaults.has(settingId)) {
              return undefined;
            }

            return this.options.getSettingValue(
              request.extensionId,
              settingId,
              defaults.get(settingId),
            ) as TValue;
          },
        },
      },
      selection: request.selection,
      input: request.input,
      permissions: extension.manifest.permissions,
    });

    try {
      extension.registerCommands?.(context);

      const command = commands.get(request.commandId);

      if (!command) {
        return {
          ok: false,
          reason: "command-not-found",
          message: `Command "${request.commandId}" is not registered by extension "${request.extensionId}".`,
        };
      }

      if (command.requiresSelection && context.selection.fileIds.length === 0) {
        return {
          ok: false,
          reason: "validation-failed",
          message: `Command "${request.commandId}" requires a file selection.`,
        };
      }

      if (command.scope === "folder" && !context.selection.folderPath) {
        return {
          ok: false,
          reason: "validation-failed",
          message: `Command "${request.commandId}" requires a folder path.`,
        };
      }

      const value = await commands.execute(request.commandId, request.input);

      return isYardUiIntent(value)
        ? { ok: true, type: "ui-intent", intent: value }
        : { ok: true, type: "value", value: value as T };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      return {
        ok: false,
        reason:
          error instanceof YardPermissionError
            ? "permission-denied"
            : error instanceof YardCommandValidationError
              ? "validation-failed"
              : "execution-failed",
        message,
      };
    }
  }
}
