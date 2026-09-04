import type { YardExtensionContext } from "yard-core";

import { createService } from "./service";

export function registerCommands(context: YardExtensionContext) {
  context.services.commands.register({
    id: "example-extension.run",
    title: "Run Example Extension",
    description: "Runs this extension on the current selection.",
    scope: "selection",
    requiresSelection: true,
    handler: async () => {
      const service = createService(context);
      return service.run();
    }
  });
}
