import type { ExtensionV2Permission } from "@yard-core";

import { getV2Events } from "./events";
import { getV2Runtime } from "./runtime";
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
 * ignored and counted, never thrown. Grant tokens live only in the
 * runtime's in-memory grant stores and expire on restart; only the
 * approval list survives.
 *
 * Durability (#266): a hydration failure leaves the policy unloaded
 * (deny by default) so the next call retries instead of freezing on a
 * false "loaded". A write failure is never reported as success: a grant
 * that could not be persisted is rolled back, a revocation stays
 * fail-closed in memory, and both record an explicit degraded state.
 */

const APPROVALS_KEY = "v2:approvals";

/**
 * Approvals live on the process-wide runtime, not module state: Next
 * compiles each route into its own bundle, so plain module-level state
 * splits per route subtree in development (approving in one bundle
 * would still read denied in another). The runtime is the sharing
 * boundary, exactly like its enablement set and job manager.
 */

function ensureLoaded(): void {
  const runtime = getV2Runtime();
  if (runtime.approvalsLoaded) return;
  try {
    const stored = readV2SettingsRow(APPROVALS_KEY);
    if (stored !== undefined) {
      runtime.approvals.restore({ approvals: (stored as { approvals?: unknown }).approvals ?? stored });
    }
    runtime.approvalsLoaded = true;
    runtime.policyDegraded = null;
  } catch {
    // Corrupt or unavailable approvals deny by default; the next call
    // retries because `approvalsLoaded` stays false.
    runtime.policyDegraded =
      "Approval policy could not be read; approvals deny by default until storage recovers.";
  }
}

function persist(): void {
  writeV2SettingsRow(APPROVALS_KEY, { approvals: getV2Runtime().approvals.snapshot() });
}

/**
 * Refuse a change while hydration has never succeeded: persisting a
 * snapshot built from unloaded memory would clobber approvals that the
 * failing read could not surface. The caller gets the degraded error
 * instead of a false success.
 */
function assertLoaded(): void {
  if (!getV2Runtime().approvalsLoaded) {
    throw new Error(
      "Approval policy is not loaded; refusing to change it so persisted approvals are not overwritten. Retry once storage recovers.",
    );
  }
}

/** Approved (unexpired) permissions for an extension; empty by default. */
export function getV2GrantedPermissions(extensionId: string): ExtensionV2Permission[] {
  ensureLoaded();
  return getV2Runtime().approvals.grantedPermissions(extensionId);
}

/** Record an explicit approval. Never called implicitly by the host. Persists, then notifies. */
export function setV2Approval(
  extensionId: string,
  permissions: readonly ExtensionV2Permission[],
  options?: { expiresAt?: string },
): void {
  ensureLoaded();
  assertLoaded();
  const runtime = getV2Runtime();
  const previous = runtime.approvals
    .snapshot()
    .find((approval) => approval.extensionId === extensionId);
  runtime.approvals.setApproval(extensionId, permissions, options);
  try {
    persist();
    runtime.policyDegraded = null;
  } catch (error) {
    // No unpersisted authority survives: a grant that could not be
    // written is rolled back, and the failure is reported.
    if (previous) runtime.approvals.restore({ approvals: [previous] });
    else runtime.approvals.revoke(extensionId);
    runtime.policyDegraded =
      "Approval write failed; the change was not applied and access stays unchanged.";
    throw error;
  }
  getV2Events().emit("approvals-changed", extensionId, { keys: [...permissions] });
}

export function revokeV2Approval(extensionId: string): void {
  ensureLoaded();
  assertLoaded();
  const runtime = getV2Runtime();
  runtime.approvals.revoke(extensionId);
  try {
    persist();
    runtime.policyDegraded = null;
  } catch (error) {
    // Revocation is fail-closed: it stands in memory even when it could
    // not be persisted, and the failure is reported, never hidden.
    runtime.policyDegraded =
      "Approval revocation could not be persisted; access is denied now but may return on restart.";
    throw error;
  }
  getV2Events().emit("approvals-changed", extensionId);
}
