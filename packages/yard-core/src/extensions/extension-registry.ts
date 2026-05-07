import { YardCoreError } from "../errors/yard-core-error";

import type { YardCommand } from "./extension-command";
import type { YardExtensionManifest } from "./extension-manifest";
import type { YardPermission } from "./extension-permissions";
import type { YardSetting } from "./extension-settings";
import type { YardExtensionDefinition } from "./extension-types";

function cloneCommand(command: YardCommand): YardCommand {
  return { ...command };
}

function cloneSetting(setting: YardSetting): YardSetting {
  return {
    ...setting,
    options: setting.options?.map((option) => ({ ...option })),
  };
}

function cloneManifest(manifest: YardExtensionManifest): YardExtensionManifest {
  return {
    ...manifest,
    permissions: [...manifest.permissions],
    commands: manifest.commands.map(cloneCommand),
    settings: manifest.settings?.map(cloneSetting),
    surfaces: manifest.surfaces ? [...manifest.surfaces] : undefined,
  };
}

function cloneDefinition(
  definition: YardExtensionDefinition,
): YardExtensionDefinition {
  return {
    ...definition,
    manifest: cloneManifest(definition.manifest),
  };
}

function assertRequiredString(fieldName: string, value: string) {
  if (!value || !value.trim()) {
    throw new YardCoreError(`Extension manifest field "${fieldName}" must not be empty.`);
  }

  if (value.trim() !== value) {
    throw new YardCoreError(
      `Extension manifest field "${fieldName}" must not contain surrounding whitespace.`,
    );
  }
}

function validatePermission(permission: YardPermission, extensionId: string) {
  if (!permission.trim()) {
    throw new YardCoreError(
      `Extension "${extensionId}" contains an empty permission entry.`,
    );
  }
}

function validateCommand(command: YardCommand, extensionId: string) {
  assertRequiredString("command.id", command.id);
  assertRequiredString("command.title", command.title);
  assertRequiredString("command.description", command.description);

  if (!command.id.startsWith(`${extensionId}.`)) {
    throw new YardCoreError(
      `Extension command "${command.id}" must be prefixed with "${extensionId}."`,
    );
  }
}

function validateSetting(setting: YardSetting, extensionId: string) {
  assertRequiredString("setting.id", setting.id);
  assertRequiredString("setting.label", setting.label);

  if (setting.type === "select") {
    if (setting.options && setting.options.some((option) => !option.label.trim() || !option.value.trim())) {
      throw new YardCoreError(
        `Extension "${extensionId}" contains a malformed select setting option.`,
      );
    }
  }
}

function validateManifest(manifest: YardExtensionManifest) {
  assertRequiredString("id", manifest.id);
  assertRequiredString("name", manifest.name);
  assertRequiredString("version", manifest.version);
  assertRequiredString("description", manifest.description);

  const commandIds = new Set<string>();

  for (const permission of manifest.permissions) {
    validatePermission(permission, manifest.id);
  }

  for (const command of manifest.commands) {
    validateCommand(command, manifest.id);

    if (commandIds.has(command.id)) {
      throw new YardCoreError(
        `Extension "${manifest.id}" contains duplicate command ID "${command.id}".`,
      );
    }

    commandIds.add(command.id);
  }

  for (const setting of manifest.settings ?? []) {
    validateSetting(setting, manifest.id);
  }
}

export class YardExtensionRegistry {
  private readonly extensions = new Map<string, YardExtensionDefinition>();

  register(extension: YardExtensionDefinition): void {
    validateManifest(extension.manifest);

    if (this.extensions.has(extension.manifest.id)) {
      throw new YardCoreError(
        `Extension "${extension.manifest.id}" is already registered.`,
      );
    }

    this.extensions.set(extension.manifest.id, extension);
  }

  unregister(extensionId: string): void {
    this.extensions.delete(extensionId);
  }

  get(extensionId: string): YardExtensionDefinition | undefined {
    const extension = this.extensions.get(extensionId);
    return extension ? cloneDefinition(extension) : undefined;
  }

  list(): YardExtensionDefinition[] {
    return Array.from(this.extensions.values(), cloneDefinition);
  }

  listManifests(): YardExtensionManifest[] {
    return Array.from(this.extensions.values(), (extension) =>
      cloneManifest(extension.manifest),
    );
  }
}
