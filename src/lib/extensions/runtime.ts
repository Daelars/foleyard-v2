import {
  YardCoreError,
  YardExtensionRegistry,
  createYardExtensionContext,
} from "@yard-core";

import { createExtensionServices } from "@/lib/composition-root";

export const extensionRegistry = new YardExtensionRegistry();

export function registerExtensionCommands(
  extensionId: string,
  options?: {
    selection?: {
      fileIds?: string[];
      folderPath?: string;
      collectionId?: string;
    };
  },
) {
  const extension = extensionRegistry.get(extensionId);
  if (!extension?.registerCommands) {
    return;
  }

  for (const command of extension.manifest.commands) {
    if (!command.id.startsWith(`${extension.manifest.id}.`)) {
      throw new YardCoreError(
        `Extension command "${command.id}" must be prefixed with "${extension.manifest.id}."`,
      );
    }
  }

  const context = createYardExtensionContext({
    services: createExtensionServices(),
    selection: options?.selection,
    permissions: extension.manifest.permissions,
  });

  extension.registerCommands(context);
}
