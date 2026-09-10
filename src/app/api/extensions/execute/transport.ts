/**
 * v1 execution transport (Application context).
 *
 * All six v1 tools have retired to their v2 ports and the registration
 * table is empty, so no command-specific adapters remain: every body
 * passes through untouched and the route fails closed on the unknown
 * extension id. The envelope validation stays so malformed bodies
 * still reject with 400 before the registry lookup.
 */

export type ExecuteTransportBody = {
  extensionId?: string;
  commandId?: string;
  selection?: {
    fileIds?: string[];
    folderPath?: string;
    collectionId?: string;
  };
  input?: unknown;
  destinationGrant?: string;
};

export type ResolvedCommandTransport =
  | {
      ok: true;
      selection?: ExecuteTransportBody["selection"];
      input?: unknown;
      inputProvided: boolean;
      destinationGrant?: string;
      shapeResult?: (value: unknown) => unknown | Promise<unknown>;
    }
  | { ok: false; message: string; status: number };

type TransportAdapter = (
  body: ExecuteTransportBody,
) => Promise<ResolvedCommandTransport>;

function passthrough(): ResolvedCommandTransport {
  return { ok: true, inputProvided: false };
}

const transportAdapters: Record<string, TransportAdapter> = {};

export function validateTransportEnvelope(body: unknown): string | null {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return "request body must be an object";
  }
  const rec = body as Record<string, unknown>;
  if (typeof rec.extensionId !== "string" || !rec.extensionId.trim()) {
    return "extensionId must be a non-empty string";
  }
  if (typeof rec.commandId !== "string" || !rec.commandId.trim()) {
    return "commandId must be a non-empty string";
  }
  if (rec.selection !== undefined) {
    if (typeof rec.selection !== "object" || rec.selection === null || Array.isArray(rec.selection)) {
      return "selection must be an object";
    }
    const sel = rec.selection as Record<string, unknown>;
    for (const key of ["fileIds", "folderPath", "collectionId"] as const) {
      void key;
    }
    if (sel.fileIds !== undefined && (!Array.isArray(sel.fileIds) || !sel.fileIds.every((v) => typeof v === "string"))) {
      return "selection.fileIds must be an array of strings";
    }
    if (sel.folderPath !== undefined && typeof sel.folderPath !== "string") {
      return "selection.folderPath must be a string";
    }
    if (sel.collectionId !== undefined && typeof sel.collectionId !== "string") {
      return "selection.collectionId must be a string";
    }
  }
  if (rec.destinationGrant !== undefined && typeof rec.destinationGrant !== "string") {
    return "destinationGrant must be a string";
  }
  return null;
}

export function resolveCommandTransport(
  body: ExecuteTransportBody,
): Promise<ResolvedCommandTransport> {
  const adapter =
    transportAdapters[`${body.extensionId} ${body.commandId}`];
  if (!adapter) {
    return Promise.resolve(passthrough());
  }

  return adapter(body);
}
