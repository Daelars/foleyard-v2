import { registerGrant } from "@/lib/filesystem-boundary";
import type { V2SourceGrantStore } from "@yard-core";

import { getV2Runtime } from "./runtime";

/**
 * Application readable source-grant bridge (Application context, E1 #176).
 *
 * Library Gatherer v2 reads external source folders outside the
 * Library roots; Folder Janitor v2 scans user-picked folders. Both
 * authorize through readable source grants issued here. The grants and
 * their picker-token map belong to the process-wide runtime, so a
 * source grant issued through the grants route authorizes execution
 * through any other route bundle. Tokens never enter definitions,
 * logs, exports, or persisted state, and a restart clears them so
 * previously issued access stops working. A source grant never
 * authorizes a write — that separation is enforced by the core folder
 * services, which check destination grants separately. No v1
 * extension modules imported.
 */

export function getV2SourceGrantStore(): V2SourceGrantStore {
  return getV2Runtime().sourceGrants.store;
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
  const { store, tokens } = getV2Runtime().sourceGrants;
  const grant = store.issue(extensionId, path, options);
  tokens.set(grantToken, grant.grantId);
  return { grantId: grant.grantId, grantToken, path };
}

/** Resolve a renderer-supplied picker token to its grant ID, if live. */
export function resolveV2SourceGrantToken(grantToken: string): string | null {
  return getV2Runtime().sourceGrants.tokens.get(grantToken) ?? null;
}

export function revokeV2SourceGrant(grantId: string): void {
  const { store, tokens } = getV2Runtime().sourceGrants;
  store.revoke(grantId);
  for (const [token, id] of tokens) {
    if (id === grantId) tokens.delete(token);
  }
}
