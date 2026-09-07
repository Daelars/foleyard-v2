import {
  extendedOperationsOf,
  immediateV2Result,
  V2OperationError,
  type ExtensionV2Host,
  type V2HandlerContext,
} from "yard-core";

import {
  SMART_COLLECTIONS_V2_ID,
  SMART_COLLECTIONS_V2_MAX_NAME_LENGTH,
  SMART_COLLECTIONS_V2_SAVE_SEARCH,
} from "./definition";

/**
 * Smart Collections v2 command handlers (Yard Tools context, C3 #178).
 *
 * `save-search` serializes the query into the smart-collection filter
 * shape (`{"q": query}`, matching v1) and creates the Collection
 * through the v2 collections op (E1 #176). The op checks permissions
 * (`collections:write`) and filter shape; the application adapter
 * validates the query against the app-owned filter service and rejects
 * an invalid query with a reason, never a silent empty Collection.
 * Port errors that are not already typed surface as `input-invalid`.
 *
 * No v1 imports, no repository access, and no filter evaluation here:
 * the handler never guesses whether a query matches — it defers to the
 * app filter service through the port.
 */

export type SmartCollectionsV2SaveResult = {
  collectionId: string;
  name: string;
  query: string;
};

function readInput(ctx: V2HandlerContext): { name: string; query: string } {
  const raw =
    typeof ctx.invocation.input === "object" && ctx.invocation.input !== null
      ? (ctx.invocation.input as Record<string, unknown>)
      : {};
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  const query = typeof raw.query === "string" ? raw.query.trim() : "";
  if (!name) {
    throw new V2OperationError("input-invalid", "Enter a name for the smart collection.");
  }
  if (name.length > SMART_COLLECTIONS_V2_MAX_NAME_LENGTH) {
    throw new V2OperationError(
      "input-invalid",
      `The collection name is ${name.length} characters; the limit is ${SMART_COLLECTIONS_V2_MAX_NAME_LENGTH}.`,
    );
  }
  if (!query) {
    throw new V2OperationError(
      "input-invalid",
      "Enter a search query to save; an empty query would match nothing silently.",
    );
  }
  return { name, query };
}

export function runSaveSearch(ctx: V2HandlerContext) {
  const { name, query } = readInput(ctx);
  const { collections } = extendedOperationsOf(ctx);
  // v1 filter shape: a JSON object with a `q` string. The app filter
  // service (through the port) is the single source of truth for query
  // validity; the handler never evaluates the query itself.
  const filter = JSON.stringify({ q: query });
  let collectionId: string;
  try {
    collectionId = collections.createSmart(name, filter).id;
  } catch (error) {
    if (error instanceof V2OperationError) throw error;
    throw new V2OperationError(
      "input-invalid",
      error instanceof Error ? error.message : String(error),
    );
  }
  return immediateV2Result({ collectionId, name, query } satisfies SmartCollectionsV2SaveResult);
}

/** Register the save-search command on a v2 host. */
export function registerSmartCollectionsV2Handlers(host: ExtensionV2Host): void {
  host.registerHandler(SMART_COLLECTIONS_V2_ID, SMART_COLLECTIONS_V2_SAVE_SEARCH, runSaveSearch);
}
