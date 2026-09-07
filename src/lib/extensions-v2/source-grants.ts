import { registerGrant } from "@/lib/filesystem-boundary";
import { V2SourceGrantStore } from "@yard-core";

/**
 * Application readable source-grant bridge (Application context, E1 #176).
 *
 * Library Gatherer v2 reads external source folders outside the
 * Library roots; Folder Janitor v2 scans user-picked folders. Both
 * authorize through readable source grants issued here. The desktop
 * picker token maps to the grant ID in memory (the same pattern as
 * the destination-grant bridge in `filesystem.ts`): tokens never
 * enter definitions, logs, exports, or persisted state, and a restart
 * clears the map so previously issued access stops working. A source
 * grant never authorizes a write — that separation is enforced by the
 * core folder services, which check destination grants separately.
 * No v1 extension modules imported.
 */

const sourceGrantStore: V2SourceGrantStore = new V2SourceGrantStore();
const tokenToGrantId = new Map<string, string>();

export function getV2SourceGrantStore(): V2SourceGrantStore {
  return sourceGrantStore;
}

/**
 * Bridge a desktop picker source folder into a core readable grant.
 * The opaque picker token maps to the grant ID in memory; handlers
 * only ever see the grant ID.
 */
export async function issueV2SourceGrant(
  extensionId: string,
  directoryPath: string,
  options?: { expiresAt?: string },
): Promise<{ grantId: string; grantToken: string; path: string }> {
  const { path, grantToken } = await registerGrant(directoryPath);
  const grant = sourceGrantStore.issue(extensionId, path, options);
  tokenToGrantId.set(grantToken, grant.grantId);
  return { grantId: grant.grantId, grantToken, path };
}

/** Resolve a renderer-supplied picker token to its grant ID, if live. */
export function resolveV2SourceGrantToken(grantToken: string): string | null {
  return tokenToGrantId.get(grantToken) ?? null;
}

export function revokeV2SourceGrant(grantId: string): void {
  sourceGrantStore.revoke(grantId);
  for (const [token, id] of tokenToGrantId) {
    if (id === grantId) tokenToGrantId.delete(token);
  }
}
