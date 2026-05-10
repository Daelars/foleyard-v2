import type { YardExtensionContext } from "yard-core";

import { createService } from "./service";

export function registerCommands(context: YardExtensionContext) {
  context.services.commands.register({
    id: "drop-rules.preview-drop",
    title: "Preview Drop Rules",
    description: "Preview the file actions that Drop Rules would perform.",
    scope: "drop",
    requiresSelection: true,
    handler: () => createService(context),
  });

  context.services.commands.register({
    id: "drop-rules.apply-drop",
    title: "Apply Drop Rules",
    description: "Copy and rename dropped sounds using the configured rules.",
    scope: "drop",
    requiresSelection: true,
    handler: () => createService(context),
  });
}
