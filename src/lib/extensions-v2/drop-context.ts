import type {
  ExtensionV2Catalog,
  ExtensionV2CatalogCommand,
  V2PlanReview,
} from "@yard-core";

/**
 * Incoming OS drop → command input (Application context, #283).
 *
 * A drop only supplies file names; a drop-scope command needs the Library
 * IDs behind those names plus the destination/staging grant its schema
 * declares. These helpers turn those pieces into the exact command input
 * each offered command requires, so the drop zone never invokes a drop
 * command with a half-built payload (the disconnection #283 repairs).
 */

/** The destination/staging grant slot a drop command's input declares, if any. */
export type V2DropGrantSlot = "destGrantId" | "stagingGrantId";

export function findCatalogCommand(
  catalog: ExtensionV2Catalog | null | undefined,
  extensionId: string,
  commandId: string,
): ExtensionV2CatalogCommand | null {
  const entry = catalog?.entries.find((candidate) => candidate.id === extensionId);
  return entry?.commands.find((candidate) => candidate.id === commandId) ?? null;
}

/**
 * Which grant slot the command needs, from its declared input schema.
 * `destination` covers both the copy destination (`destGrantId`) and the
 * drag-out staging destination (`stagingGrantId`): both are chosen with
 * the same native folder picker.
 */
export function dropGrantSlot(
  command: ExtensionV2CatalogCommand | null,
): V2DropGrantSlot | null {
  const schema = command?.input;
  if (!schema || schema.kind !== "object") return null;
  if ("destGrantId" in schema.properties) return "destGrantId";
  if ("stagingGrantId" in schema.properties) return "stagingGrantId";
  return null;
}

/**
 * Build the command input for one drop offer from the resolved drop. Only
 * declared fields are supplied: `fileIds` (or the single `fileId` a
 * drag-out command takes) and the grant slot when the command needs one.
 */
export function buildDropCommandInput(
  command: ExtensionV2CatalogCommand | null,
  fileIds: readonly string[],
  grantId: string | null,
): Record<string, unknown> {
  const schema = command?.input;
  const properties =
    schema && schema.kind === "object" ? schema.properties : undefined;
  const input: Record<string, unknown> = {};
  if (properties && "fileId" in properties) {
    if (fileIds[0]) input.fileId = fileIds[0];
  } else if (properties && "fileIds" in properties) {
    if (fileIds.length > 0) input.fileIds = [...fileIds];
  } else if (fileIds.length > 0) {
    input.fileIds = [...fileIds];
  }
  const slot = dropGrantSlot(command);
  if (slot && grantId) input[slot] = grantId;
  return input;
}

/** Summary the drop zone shows after a review plan is applied. */
export type V2DropApplySummary = {
  review: V2PlanReview;
  value: unknown;
};

/**
 * Resolve dropped OS file names to Library IDs through the files API,
 * matching the exact filename case-insensitively. Names that are not in
 * the Library (or are ambiguous) report as missing rather than being
 * guessed; the handler then reports them with reasons.
 */
export async function resolveDropFilesFromLibrary(
  names: readonly string[],
): Promise<{ fileIds: string[]; missing: string[] }> {
  const fileIds: string[] = [];
  const missing: string[] = [];
  const seen = new Set<string>();
  for (const name of names) {
    let matched = false;
    try {
      const response = await fetch(`/api/files?q=${encodeURIComponent(name)}`);
      if (response.ok) {
        const data = (await response.json()) as {
          files?: Array<{ id?: unknown; filename?: unknown }>;
        };
        const match = (data.files ?? []).find(
          (file) =>
            typeof file.id === "string" &&
            typeof file.filename === "string" &&
            file.filename.toLowerCase() === name.toLowerCase(),
        );
        if (match && typeof match.id === "string" && !seen.has(match.id)) {
          seen.add(match.id);
          fileIds.push(match.id);
          matched = true;
        }
      }
    } catch {
      matched = false;
    }
    if (!matched) missing.push(name);
  }
  return { fileIds, missing };
}
