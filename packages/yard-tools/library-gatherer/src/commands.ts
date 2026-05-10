import type { YardExtensionContext } from "yard-core";

import { createService } from "./service";

export function registerCommands(context: YardExtensionContext) {
  context.services.commands.register({
    id: "library-gatherer.preview-gather",
    title: "Preview Library Gather",
    description: "Preview sounds that would be gathered into the main library.",
    scope: "global",
    handler: () => createService(context),
  });

  context.services.commands.register({
    id: "library-gatherer.gather",
    title: "Gather Library",
    description: "Copy sounds from multiple folders into one library folder.",
    scope: "global",
    handler: () => createService(context),
  });
}
