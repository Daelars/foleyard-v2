import {
  YardCommandValidationError,
  type YardExtensionContext,
} from "yard-core";

import { createService } from "./service";
import type { SmartCollectionFilter } from "./types";

export function registerCommands(context: YardExtensionContext) {
  context.services.commands.register({
    id: "smart-collections.save-search",
    title: "Save Search as Smart Collection",
    description: "Save the current search query as a smart collection.",
    scope: "global",
    handler: () => {
      const input = context.input as
        | { name?: string; filter?: SmartCollectionFilter }
        | undefined;
      const name = input?.name?.trim();
      if (!name || !input?.filter) {
        throw new YardCommandValidationError("name and filter are required");
      }

      return createService(context).saveSearch(name, input.filter);
    },
  });
}
