import type { YardExtensionContext } from "yard-core";

import type { SoundShelfResult } from "./types";
import { InMemorySoundShelfStore, type SoundShelfStore } from "./store";

export function createService(context: YardExtensionContext) {
  return new SoundShelfService(context, new InMemorySoundShelfStore());
}

export function createServiceWithStore(
  context: YardExtensionContext,
  store: SoundShelfStore,
) {
  return new SoundShelfService(context, store);
}

export class SoundShelfService {
  constructor(
    private context: YardExtensionContext,
    private store: SoundShelfStore,
  ) {}

  addSelected(fileIds: string[]): SoundShelfResult {
    this.context.permissions.require("library:read");

    const current = new Set(this.store.getFileIds());
    let added = 0;

    for (const id of fileIds) {
      if (!current.has(id)) {
        current.add(id);
        added++;
      }
    }

    this.store.setFileIds(Array.from(current));

    return {
      added,
      removed: 0,
      remaining: current.size,
    };
  }

  removeSelected(fileIds: string[]): SoundShelfResult {
    this.context.permissions.require("library:read");

    const targetIds = new Set(fileIds);
    const current = this.store.getFileIds();
    const next = current.filter((id) => !targetIds.has(id));

    this.store.setFileIds(next);

    return {
      added: 0,
      removed: current.length - next.length,
      remaining: next.length,
    };
  }

  clear(): SoundShelfResult {
    const current = this.store.getFileIds();
    this.store.setFileIds([]);

    return {
      added: 0,
      removed: current.length,
      remaining: 0,
    };
  }

  getItems(): string[] {
    return this.store.getFileIds();
  }

  contains(fileId: string): boolean {
    return this.store.getFileIds().some((id) => id === fileId);
  }
}
