import fs from "node:fs";

import { getLibraryRoots } from "@/lib/db";
import { registerGrant } from "@/lib/filesystem-boundary";
import type { V2FileContentPorts, V2GrantStore, V2PathIo } from "@yard-core";
import { V2GrantStore as GrantStore } from "@yard-core";

/**
 * Application file-content ports and destination-grant bridge
 * (Application context, R3).
 *
 * The core operation services authorize every path through the
 * filesystem ADR guards; this module supplies the node primitives
 * underneath and bridges desktop picker tokens to core grant IDs.
 * Tokens stay in this in-memory map: they never enter definitions,
 * logs, exports, or persisted state, and a restart clears the map so
 * previously issued access stops working.
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
    copyFile: async (sourceCanonical, destCanonical) =>
      fs.promises.copyFile(sourceCanonical, destCanonical),
    writeFileBytes: async (destCanonical, bytes) =>
      fs.promises.writeFile(destCanonical, bytes),
    deleteFile: async (canonicalPath) => fs.promises.rm(canonicalPath, { force: true }),
    exists: async (canonicalPath) => {
      try {
        await fs.promises.lstat(canonicalPath);
        return true;
      } catch {
        return false;
      }
    },
    libraryRoots: () => getLibraryRoots(),
    pathIo: () => nodePathIo,
  };
}

const grantStore: V2GrantStore = new GrantStore();
const tokenToGrantId = new Map<string, string>();

export function getV2GrantStore(): V2GrantStore {
  return grantStore;
}

/**
 * Bridge a desktop picker destination into a core grant. The opaque
 * picker token maps to the grant ID in memory; handlers only ever see
 * the grant ID.
 */
export async function issueV2DestinationGrant(
  extensionId: string,
  directoryPath: string,
  options?: { expiresAt?: string },
): Promise<{ grantId: string; grantToken: string; path: string }> {
  const { path, grantToken } = await registerGrant(directoryPath);
  const grant = grantStore.issue(extensionId, path, options);
  tokenToGrantId.set(grantToken, grant.grantId);
  return { grantId: grant.grantId, grantToken, path };
}

/** Resolve a renderer-supplied picker token to its grant ID, if live. */
export function resolveV2GrantToken(grantToken: string): string | null {
  return tokenToGrantId.get(grantToken) ?? null;
}

export function revokeV2DestinationGrant(grantId: string): void {
  grantStore.revoke(grantId);
  for (const [token, id] of tokenToGrantId) {
    if (id === grantId) tokenToGrantId.delete(token);
  }
}
