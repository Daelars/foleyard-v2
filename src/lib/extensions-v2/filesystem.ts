import fs from "node:fs";

import { getLibraryRoots } from "@/lib/db";
import { registerGrant } from "@/lib/filesystem-boundary";
import type { V2FileContentPorts, V2GrantStore, V2PathIo } from "@yard-core";

import {
  copyV2FileExclusive,
  removeV2FileIfVersion,
  writeV2FileBytesExclusive,
} from "./output-files";
import { getV2Runtime } from "./runtime";

/**
 * Application file-content ports and destination-grant bridge
 * (Application context, R3).
 *
 * The core operation services authorize every path through the
 * filesystem ADR guards; this module supplies the node primitives
 * underneath and bridges desktop picker tokens to core grant IDs.
 * Output creation is exclusive and cleanup is version-checked, both
 * through `output-files.ts` (#267): a pre-existing file is never
 * truncated and a replacement at a previously owned path is never
 * deleted. Grants and tokens live on the process-wide runtime, so a
 * grant issued by one route bundle authorizes execution through
 * another. Tokens never enter definitions, logs, exports, or persisted
 * state, and a restart clears them so previously issued access stops
 * working.
 */

const nodePathIo: V2PathIo = {
  realpath: (candidate) => fs.promises.realpath(candidate),
  lstat: async (candidate) => {
    try {
      const entry = await fs.promises.lstat(candidate);
      return { exists: true, isLink: entry.isSymbolicLink() };
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        return { exists: false, isLink: false };
      }
      throw error;
    }
  },
};

/** Node-backed file bytes behind the authorized v2 operation services. */
export function createV2FileContentPorts(): V2FileContentPorts {
  return {
    readFileBytes: async (canonicalPath) =>
      new Uint8Array(await fs.promises.readFile(canonicalPath)),
    // Exclusive creation and version-checked removal live in
    // `output-files.ts`, shared with the ZIP writer: the create is the
    // claim, so a pre-existing or concurrently claimed destination is
    // never truncated or overwritten.
    copyFile: copyV2FileExclusive,
    writeFileBytes: writeV2FileBytesExclusive,
    deleteFileIfVersion: async (canonicalPath, version) => ({
      removed: await removeV2FileIfVersion(canonicalPath, version),
    }),
    libraryRoots: () => getLibraryRoots(),
    pathIo: () => nodePathIo,
  };
}

/**
 * Destination grants belong to the process-wide runtime: the grants
 * route issues them and execution authorizes them from different route
 * bundles, so a per-module store would deny a grant the picker just
 * issued. Tokens stay in the runtime's in-memory map: they never enter
 * definitions, logs, exports, or persisted state, and a restart clears
 * the map so previously issued access stops working.
 */

export function getV2GrantStore(): V2GrantStore {
  return getV2Runtime().destinationGrants.store;
}

/**
 * Bridge a picker-authorized canonical folder into a core destination
 * grant. `canonicalPath` must come from a spent picker proof (see
 * `picker-proofs.ts`); the opaque filesystem-boundary token maps to the
 * grant ID in memory and handlers only ever see the grant ID.
 */
export async function issueV2DestinationGrant(
  extensionId: string,
  directoryPath: string,
  options?: { expiresAt?: string },
): Promise<{ grantId: string; grantToken: string; path: string }> {
  const { path, grantToken } = await registerGrant(directoryPath);
  const { store, tokens } = getV2Runtime().destinationGrants;
  const grant = store.issue(extensionId, path, options);
  tokens.set(grantToken, grant.grantId);
  return { grantId: grant.grantId, grantToken, path };
}

/** Resolve a renderer-supplied picker token to its grant ID, if live. */
export function resolveV2GrantToken(grantToken: string): string | null {
  return getV2Runtime().destinationGrants.tokens.get(grantToken) ?? null;
}

export function revokeV2DestinationGrant(grantId: string): void {
  const { store, tokens } = getV2Runtime().destinationGrants;
  store.revoke(grantId);
  for (const [token, id] of tokens) {
    if (id === grantId) tokens.delete(token);
  }
}
