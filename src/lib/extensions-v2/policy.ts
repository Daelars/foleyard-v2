import {
  V2PermissionApprovals,
  type ExtensionV2Permission,
} from "@yard-core";

import { getV2Events } from "./events";
import { readV2SettingsRow, writeV2SettingsRow } from "./settings-state";

/**
 * Explicit v2 permission approval policy (Application context, R7).
 *
 * Deny-by-default: no approvals exist until recorded here, and nothing
 * is inferred from requests. The host intersects these approvals with
 * each extension's declarations to form the effective set.
 *
 * Persistence (adopted in R7; in-memory before): approvals are a
 * serializable snapshot in the existing `settings` table under
 * `v2:approvals` — no new migration, the same pattern the jobs snapshot
 * proved. Loaded once per process boot; every change persists first and
 * emits `approvals-changed` afterwards. Malformed stored entries are
 * ignored and counted, never thrown. Grant tokens still live only in
 * module-level memory and expire on restart; only the approval list
 * survives.
 */

const APPROVALS_KEY = "v2:approvals";

const approvals = new V2PermissionApprovals();
let bootLoaded = false;

function ensureLoaded(): void {
  if (bootLoaded) return;
  bootLoaded = true;
  try {
    const stored = readV2SettingsRow(APPROVALS_KEY);
    if (stored !== undefined) {
      approvals.restore({ approvals: (stored as { approvals?: unknown }).approvals ?? stored });
    }
  } catch {
    // Corrupt approvals deny by default; an explicit re-approval recovers.
  }
}

function persist(): void {
  try {
    writeV2SettingsRow(APPROVALS_KEY, { approvals: approvals.snapshot() });
  } catch {
    // Approval persistence is diagnostic transport: a write failure must
    // never fail the approval change itself. The next change retries.
  }
}

/** Approved (unexpired) permissions for an extension; empty by default. */
export function getV2GrantedPermissions(extensionId: string): ExtensionV2Permission[] {
  ensureLoaded();
  return approvals.grantedPermissions(extensionId);
}

/** Record an explicit approval. Never called implicitly by the host. Persists, then notifies. */
export function setV2Approval(
  extensionId: string,
  permissions: readonly ExtensionV2Permission[],
  options?: { expiresAt?: string },
): void {
  ensureLoaded();
  approvals.setApproval(extensionId, permissions, options);
  persist();
  getV2Events().emit("approvals-changed", extensionId, { keys: [...permissions] });
}

export function revokeV2Approval(extensionId: string): void {
  ensureLoaded();
  approvals.revoke(extensionId);
  persist();
  getV2Events().emit("approvals-changed", extensionId);
}
