import {
  extendedOperationsOf,
  immediateV2Result,
  V2OperationError,
  type ExtensionV2Host,
  type V2HandlerContext,
} from "yard-core";

import {
  SOUND_SHELF_V2_ADD,
  SOUND_SHELF_V2_CLEAR,
  SOUND_SHELF_V2_ID,
  SOUND_SHELF_V2_LIST,
  SOUND_SHELF_V2_REMOVE,
} from "./definition";

/**
 * Sound Shelf v2 command handlers (Yard Tools context, S2 #177).
 *
 * Every effect runs through the v2 shelf op (E1 #176): the store holds
 * Library index IDs, add validates against the index before writing
 * (an unindexed ID rejects the whole call and nothing is stored), and
 * every read repairs itself by pruning IDs that left the index. The
 * op persists before notifying and enforces `library:read` first, so
 * an unauthorized handler stays confined. No v1 imports, no direct
 * storage access, no favorites and no Collections.
 *
 * All four commands settle immediately: there is no destructive
 * filesystem effect to review, so no plan/grant/job machinery is
 * needed. add/remove read the selected sounds from the invocation;
 * clear/list are global.
 */

export type SoundShelfV2MutationResult = {
  added: number;
  removed: number;
  total: number;
};

export type SoundShelfV2ListResult = {
  ids: string[];
  repaired: string[];
  total: number;
};

function selectedIds(ctx: V2HandlerContext): string[] {
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const file of ctx.files) {
    if (!seen.has(file.id)) {
      seen.add(file.id);
      ids.push(file.id);
    }
  }
  if (ids.length === 0) {
    throw new V2OperationError(
      "input-invalid",
      "No sounds are selected; select at least one sound and retry.",
    );
  }
  return ids;
}

export function runAddSelected(ctx: V2HandlerContext) {
  const { shelf } = extendedOperationsOf(ctx);
  const { added, total } = shelf.add(selectedIds(ctx));
  return immediateV2Result({ added, removed: 0, total });
}

export function runRemoveSelected(ctx: V2HandlerContext) {
  const { shelf } = extendedOperationsOf(ctx);
  const { removed, total } = shelf.remove(selectedIds(ctx));
  return immediateV2Result({ added: 0, removed, total });
}

export function runClear(ctx: V2HandlerContext) {
  const { shelf } = extendedOperationsOf(ctx);
  const { removed } = shelf.clear();
  return immediateV2Result({ added: 0, removed, total: 0 });
}

export function runList(ctx: V2HandlerContext) {
  const { shelf } = extendedOperationsOf(ctx);
  const { ids, repaired } = shelf.list();
  return immediateV2Result({ ids, repaired, total: ids.length });
}

/** Register all four shelf commands on a v2 host. */
export function registerSoundShelfV2Handlers(host: ExtensionV2Host): void {
  host.registerHandler(SOUND_SHELF_V2_ID, SOUND_SHELF_V2_ADD, runAddSelected);
  host.registerHandler(SOUND_SHELF_V2_ID, SOUND_SHELF_V2_REMOVE, runRemoveSelected);
  host.registerHandler(SOUND_SHELF_V2_ID, SOUND_SHELF_V2_CLEAR, runClear);
  host.registerHandler(SOUND_SHELF_V2_ID, SOUND_SHELF_V2_LIST, runList);
}
