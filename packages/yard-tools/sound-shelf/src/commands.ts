import type { YardExtensionContext } from "yard-core";

import { createService } from "./service";

export function registerCommands(context: YardExtensionContext) {
  context.services.commands.register({
    id: "sound-shelf.add-selected",
    title: "Add to Shelf",
    description: "Add the selected files to the Sound Shelf scratchpad.",
    scope: "selection",
    requiresSelection: true,
    handler: () => createService(context),
  });

  context.services.commands.register({
    id: "sound-shelf.remove-selected",
    title: "Remove from Shelf",
    description: "Remove the selected files from the Sound Shelf scratchpad.",
    scope: "selection",
    requiresSelection: true,
    handler: () => createService(context),
  });

  context.services.commands.register({
    id: "sound-shelf.clear",
    title: "Clear Shelf",
    description: "Remove all files from the Sound Shelf scratchpad.",
    scope: "global",
    handler: () => createService(context),
  });
}
