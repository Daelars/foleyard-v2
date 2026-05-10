import type { YardExtensionContext } from "yard-core";

import { createService } from "./service";

export function registerCommands(context: YardExtensionContext) {
  context.services.commands.register({
    id: "make-pack.from-selection",
    title: "Make Pack from Selection",
    description: "Create a pack from the selected sounds.",
    scope: "selection",
    requiresSelection: true,
    handler: async () => createService(context),
  });

  context.services.commands.register({
    id: "make-pack.from-shelf",
    title: "Make Pack from Shelf",
    description: "Create a pack from Sound Shelf items.",
    scope: "global",
    handler: async () => createService(context),
  });

  context.services.commands.register({
    id: "make-pack.from-recent",
    title: "Make Pack from Recent Sounds",
    description: "Create a pack from recently previewed sounds.",
    scope: "global",
    handler: async () => createService(context),
  });
}
