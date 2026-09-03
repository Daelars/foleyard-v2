import type { YardExtensionContext } from "yard-core";

import type { SmartCollectionFilter } from "./types";

export function createService(context: YardExtensionContext) {
  return new SmartCollectionService(context);
}

export class SmartCollectionService {
  constructor(private context: YardExtensionContext) {}

  async saveSearch(name: string, filter: SmartCollectionFilter): Promise<string> {
    this.context.permissions.require("collections:write");
    this.context.permissions.require("library:read");

    const collections = this.context.services.collections;

    if (!collections) {
      throw new Error("Collection service unavailable");
    }

    return collections.createSmartCollection(name, JSON.stringify(filter));
  }

  async updateSearch(collectionId: string, filter: SmartCollectionFilter): Promise<void> {
    this.context.permissions.require("collections:write");
    this.context.permissions.require("library:read");

    const collections = this.context.services.collections;

    if (!collections) {
      throw new Error("Collection service unavailable");
    }

    collections.updateCollectionFilter(collectionId, JSON.stringify(filter));
  }
}
