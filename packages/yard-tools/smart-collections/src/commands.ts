import {
  defineYardCommandInputSchema,
  YardCommandValidationError,
  type YardExtensionContext,
} from "yard-core";

import { createService } from "./service";
import type { SmartCollectionFilter } from "./types";

export const saveSearchInputSchema = defineYardCommandInputSchema(
  validateSaveSearchInput,
);

export function validateSaveSearchInput(input: unknown): string | null {
  const candidate = input as
    | { name?: unknown; filter?: SmartCollectionFilter }
    | undefined;
  const name = typeof candidate?.name === "string" ? candidate.name.trim() : "";
  if (!name || !candidate?.filter) {
    return "name and filter are required";
  }

  return null;
}

export function registerCommands(context: YardExtensionContext) {
  context.services.commands.register({
    id: "smart-collections.save-search",
    title: "Save Search as Smart Collection",
    description: "Save the current search query as a smart collection.",
    scope: "global",
    inputSchema: saveSearchInputSchema,
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
