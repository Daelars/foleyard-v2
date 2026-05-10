import type { YardExtensionContext } from "yard-core";

import { createService } from "./service";

export function registerCommands(context: YardExtensionContext) {
  context.services.commands.register({
    id: "folder-janitor.scan-library",
    title: "Scan Library Mess",
    description: "Create a cleanup report for the current sound library.",
    scope: "global",
    handler: () => createService(context),
  });

  context.services.commands.register({
    id: "folder-janitor.scan-folder",
    title: "Scan Folder Mess",
    description: "Create a cleanup report for the current folder.",
    scope: "folder",
    handler: () => createService(context),
  });
}
