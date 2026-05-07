import type { YardExtensionContext } from "yard-core";

import type { SoundShelfResult, SoundShelfItem } from "./types";

const shelf: SoundShelfItem[] = [];

export function createService(context: YardExtensionContext) {
  return new SoundShelfService(context);
}

export class SoundShelfService {
  constructor(private context: YardExtensionContext) {}

  addSelected(): SoundShelfResult {
    this.context.permissions.require("library:read");

    const selectedIds = this.context.selection.fileIds;
    let added = 0;

    for (const id of selectedIds) {
      if (!shelf.some((item) => item.fileId === id)) {
        shelf.push({ fileId: id });
        added++;
      }
    }

    return {
      added,
      removed: 0,
      remaining: shelf.length,
    };
  }

  removeSelected(): SoundShelfResult {
    this.context.permissions.require("library:read");

    const selectedIds = new Set(this.context.selection.fileIds);
    const before = shelf.length;

    for (let index = shelf.length - 1; index >= 0; index -= 1) {
      if (selectedIds.has(shelf[index].fileId)) {
        shelf.splice(index, 1);
      }
    }

    const removed = before - shelf.length;

    return {
      added: 0,
      removed,
      remaining: shelf.length,
    };
  }

  clear(): SoundShelfResult {
    const removed = shelf.length;
    shelf.length = 0;

    return {
      added: 0,
      removed,
      remaining: 0,
    };
  }

  getItems(): SoundShelfItem[] {
    return [...shelf];
  }

  contains(fileId: string): boolean {
    return shelf.some((item) => item.fileId === fileId);
  }
}
