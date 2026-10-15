import fs from "node:fs";
import { pipeline } from "node:stream/promises";

import { V2OutputConflictError, type V2FileVersion } from "@yard-core";

/**
 * Application output primitives (Application context, R3/R8).
 *
 * The single place v2 output creation and cleanup touch node, shared by
 * the file-content ports (`filesystem.ts`) and the ZIP writer
 * (`archive.ts`) so both enforce the same ownership rule:
 *
 * - Creation is exclusive (`open(..., "wx")`). A pre-existing entry is
 *   never truncated, and two concurrent jobs can never both claim one
 *   destination: the create *is* the claim.
 * - The version identity comes from the creating handle, not from a
 *   path lookup afterwards, so there is no window in which a replacement
 *   could be mistaken for the created entry.
 * - Removal is version-checked. A replacement at a previously owned path
 *   is left alone, and a failed write removes only the partial file this
 *   call created.
 *
 * Validation remains in `packages/yard-core/src/extensions-v2/filesystem.ts`
 * (canonical paths, grant containment); this module only performs the
 * already-authorized I/O.
 */

function isMissing(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "ENOENT"
  );
}

function versionOf(stats: fs.BigIntStats): V2FileVersion {
  return { device: stats.dev.toString(), fileId: stats.ino.toString() };
}

/** Identity of the entry at a path, or null when nothing is there. */
export async function statV2FileVersion(candidate: string): Promise<V2FileVersion | null> {
  try {
    return versionOf(await fs.promises.stat(candidate, { bigint: true }));
  } catch (error) {
    if (isMissing(error)) return null;
    throw error;
  }
}

/**
 * Claim a brand-new entry at `destPath`. Rejects with
 * `V2OutputConflictError` when an entry is already there; the existing
 * file is untouched. The returned handle keeps writing to the entry this
 * call created even if the path is later replaced.
 */
export async function createV2OutputExclusive(
  destPath: string,
): Promise<{ handle: fs.promises.FileHandle; version: V2FileVersion }> {
  let handle: fs.promises.FileHandle;
  try {
    handle = await fs.promises.open(destPath, "wx");
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: string }).code === "EEXIST"
    ) {
      throw new V2OutputConflictError(destPath);
    }
    throw error;
  }
  try {
    return { handle, version: versionOf(await handle.stat({ bigint: true })) };
  } catch (error) {
    await handle.close();
    throw error;
  }
}

/**
 * Remove `candidate` only while it still holds `version`. Reports whether
 * an entry was removed, so a replacement (a different entry at the same
 * path) reports false and survives.
 */
export async function removeV2FileIfVersion(
  candidate: string,
  version: V2FileVersion,
): Promise<boolean> {
  const current = await statV2FileVersion(candidate);
  if (!current || current.device !== version.device || current.fileId !== version.fileId) {
    return false;
  }
  await fs.promises.rm(candidate, { force: true });
  return true;
}

/**
 * Exclusively create `destCanonical` from `sourceCanonical`. On a failed
 * copy the partial file is removed (version-checked), so a retry does not
 * hit a half-written destination.
 */
export async function copyV2FileExclusive(
  sourceCanonical: string,
  destCanonical: string,
): Promise<V2FileVersion> {
  const { handle, version } = await createV2OutputExclusive(destCanonical);
  try {
    await pipeline(fs.createReadStream(sourceCanonical), handle.createWriteStream());
  } catch (error) {
    await handle.close();
    await removeV2FileIfVersion(destCanonical, version);
    throw error;
  }
  await handle.close();
  return version;
}

/** Exclusively create `destCanonical` from bytes; failed writes clean up their partial. */
export async function writeV2FileBytesExclusive(
  destCanonical: string,
  bytes: Uint8Array,
): Promise<V2FileVersion> {
  const { handle, version } = await createV2OutputExclusive(destCanonical);
  try {
    await handle.writeFile(bytes);
  } catch (error) {
    await handle.close();
    await removeV2FileIfVersion(destCanonical, version);
    throw error;
  }
  await handle.close();
  return version;
}
