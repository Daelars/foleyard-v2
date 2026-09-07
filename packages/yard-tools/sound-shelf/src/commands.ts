import type { YardExtensionContext } from "yard-core";
import { COMMAND_DEFINITIONS } from "./command-definitions";

import { createService, createServiceWithStore } from "./service";
import type { SoundShelfStore } from "./store";

export function registerCommands(
  context: YardExtensionContext,
  store?: SoundShelfStore,
) {
  const getService = () =>
    store ? createServiceWithStore(context, store) : createService(context);

  const def = (id: string) => COMMAND_DEFINITIONS.find((c) => c.id === id)!;
  context.services.commands.register({
    ...def("sound-shelf.add-selected"),
    handler: () => getService().addSelected(context.selection.fileIds),
  });

  context.services.commands.register({
    ...def("sound-shelf.remove-selected"),
    handler: () => getService().removeSelected(context.selection.fileIds),
  });

  context.services.commands.register({
    ...def("sound-shelf.clear"),
    handler: () => getService().clear(),
  });

  context.services.commands.register({
    ...def("sound-shelf.list"),
    handler: () => getService().getItems(),
  });
}
