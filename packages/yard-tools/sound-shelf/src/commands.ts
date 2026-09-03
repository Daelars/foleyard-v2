import type { YardExtensionContext } from "yard-core";

import { createService, createServiceWithStore } from "./service";
import type { SoundShelfStore } from "./store";

export function registerCommands(
  context: YardExtensionContext,
  store?: SoundShelfStore,
) {
  const getService = () =>
    store ? createServiceWithStore(context, store) : createService(context);

  context.services.commands.register({
    id: "sound-shelf.add-selected",
    title: "Add to Shelf",
    description: "Add the selected files to the Sound Shelf scratchpad.",
    scope: "selection",
    requiresSelection: true,
    handler: () => getService().addSelected(context.selection.fileIds),
  });

  context.services.commands.register({
    id: "sound-shelf.remove-selected",
    title: "Remove from Shelf",
    description: "Remove the selected files from the Sound Shelf scratchpad.",
    scope: "selection",
    requiresSelection: true,
    handler: () => getService().removeSelected(context.selection.fileIds),
  });

  context.services.commands.register({
    id: "sound-shelf.clear",
    title: "Clear Shelf",
    description: "Remove all files from the Sound Shelf scratchpad.",
    scope: "global",
    handler: () => getService().clear(),
  });

  context.services.commands.register({
    id: "sound-shelf.list",
    title: "List Shelf",
    description: "List the files in the Sound Shelf scratchpad.",
    scope: "global",
    handler: () => getService().getItems(),
  });
}
