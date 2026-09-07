import type { ExtensionV2Catalog } from "./catalog";
import {
  isKnownV2Permission,
  type ExtensionV2Definition,
  type ExtensionV2Permission,
} from "./definition";
import type { ExtensionV2Registry } from "./registry";

/**
 * Deny-by-default v2 operation permissions (Yard Core context, R3).
 *
 * Effective permissions are the intersection of the extension's declared
 * permissions and an explicit application approval. The same set drives
 * the handler operation context (`host.ts`) and the catalog projection
 * (`buildEffectiveV2Catalog` below). Permissions are never inferred from
 * method names, and requested permissions are never auto-granted: the
 * default approval is empty, so unapproved extensions compute to no
 * permissions and fail preflight with `permission-denied`.
 *
 * Approval persistence belongs to state storage (R7); this module owns
 * the explicit in-memory policy plus expiry. Grants (opaque destination
 * tokens) live in `grants.ts` and never appear here, in definitions,
 * logs, exports, or persisted state (see `findV2SecretKeys`).
 */

export type V2PermissionApproval = {
  extensionId: string;
  permissions: ExtensionV2Permission[];
  grantedAt: string;
  /** ISO timestamp; absent means no expiry. Expired approvals deny. */
  expiresAt?: string;
};

export type V2ApprovalClock = () => string;

/**
 * Intersection of declared and approved permissions, in declaration
 * order, deduplicated. Unknown approved strings are dropped: only
 * declared known permissions can become effective.
 */
export function computeEffectiveV2Permissions(
  declared: readonly ExtensionV2Permission[],
  approved: ReadonlySet<string> | readonly string[],
): ExtensionV2Permission[] {
  const allowed = approved instanceof Set ? approved : new Set(approved);
  const effective: ExtensionV2Permission[] = [];
  const seen = new Set<string>();
  for (const permission of declared) {
    if (!isKnownV2Permission(permission)) continue;
    if (seen.has(permission)) continue;
    seen.add(permission);
    if (allowed.has(permission)) effective.push(permission);
  }
  return effective;
}

export function isV2ApprovalExpired(
  approval: Pick<V2PermissionApproval, "expiresAt">,
  now = new Date().toISOString(),
): boolean {
  if (!approval.expiresAt) return false;
  return approval.expiresAt <= now;
}

/**
 * Explicit approval policy. Starts empty (deny everything); the
 * application records approvals through `setApproval`, never by
 * inferring them from requests. Expired approvals read as ungranted.
 */
export class V2PermissionApprovals {
  private readonly approvals = new Map<string, V2PermissionApproval>();

  constructor(private readonly clock: V2ApprovalClock = () => new Date().toISOString()) {}

  setApproval(
    extensionId: string,
    permissions: readonly ExtensionV2Permission[],
    options?: { expiresAt?: string },
  ): void {
    const known = permissions.filter(isKnownV2Permission);
    this.approvals.set(extensionId, {
      extensionId,
      permissions: [...new Set(known)],
      grantedAt: this.clock(),
      ...(options?.expiresAt !== undefined ? { expiresAt: options.expiresAt } : {}),
    });
  }

  revoke(extensionId: string): void {
    this.approvals.delete(extensionId);
  }

  grantedPermissions(extensionId: string, now?: string): ExtensionV2Permission[] {
    const approval = this.approvals.get(extensionId);
    if (!approval) return [];
    if (isV2ApprovalExpired(approval, now ?? this.clock())) return [];
    return [...approval.permissions];
  }

  effectivePermissions(
    definition: Pick<ExtensionV2Definition, "permissions">,
    extensionId: string,
    now?: string,
  ): ExtensionV2Permission[] {
    return computeEffectiveV2Permissions(
      definition.permissions,
      this.grantedPermissions(extensionId, now),
    );
  }

  /**
   * Serializable approval snapshot for persistence (R7). The application
   * stores this in the settings table and restores it at boot, so
   * explicit approvals survive restarts while grant tokens (kept
   * separately in memory) still expire. Never carries secrets — see
   * `findV2SecretKeys`.
   */
  snapshot(): V2PermissionApproval[] {
    return [...this.approvals.values()].map((approval) => ({
      ...approval,
      permissions: [...approval.permissions],
    }));
  }

  /**
   * Load a persisted snapshot. Malformed entries are ignored and
   * counted; unknown permission strings are dropped. Never throws on
   * stored data.
   */
  restore(snapshot: unknown): { restored: number; ignored: number } {
    let restored = 0;
    let ignored = 0;
    const list = (snapshot as { approvals?: unknown })?.approvals;
    if (!Array.isArray(list)) return { restored, ignored };
    for (const raw of list) {
      if (typeof raw !== "object" || raw === null) {
        ignored += 1;
        continue;
      }
      const candidate = raw as Record<string, unknown>;
      if (typeof candidate.extensionId !== "string" || !candidate.extensionId.trim()) {
        ignored += 1;
        continue;
      }
      if (!Array.isArray(candidate.permissions) || typeof candidate.grantedAt !== "string") {
        ignored += 1;
        continue;
      }
      const known = (candidate.permissions as unknown[]).filter(isKnownV2Permission);
      this.approvals.set(candidate.extensionId, {
        extensionId: candidate.extensionId,
        permissions: [...new Set(known)],
        grantedAt: candidate.grantedAt,
        ...(typeof candidate.expiresAt === "string" ? { expiresAt: candidate.expiresAt } : {}),
      });
      restored += 1;
    }
    return { restored, ignored };
  }
}

/**
 * Catalog projection carrying the effective permission set instead of
 * the declared one, so renderers disable exactly what execution would
 * deny. Shares `computeEffectiveV2Permissions` with the host path.
 */
export function buildEffectiveV2Catalog(
  registry: ExtensionV2Registry,
  grantedFor: (extensionId: string) => ReadonlySet<string> | readonly string[],
): ExtensionV2Catalog {
  const catalog = registry.buildCatalog();
  return {
    apiVersion: catalog.apiVersion,
    entries: catalog.entries.map((entry) => {
      const definition = registry.get(entry.id);
      const effective = definition
        ? computeEffectiveV2Permissions(definition.permissions, grantedFor(entry.id))
        : [];
      return { ...entry, permissions: effective };
    }),
  };
}

const SECRET_KEY_PATTERN = /(granttoken|accesstoken|refreshtoken|token|secret|password|authorization|apikey|api_key)/i;

/**
 * Find object keys that look like grant tokens or secrets (JSON paths).
 * Definitions, catalogs, logs, exports, and persisted state must carry
 * none of these; the check fails loudly instead of letting a token
 * leak into a serializable payload.
 */
export function findV2SecretKeys(value: unknown, path = "$"): string[] {
  const hits: string[] = [];
  const visit = (node: unknown, at: string): void => {
    if (typeof node !== "object" || node === null) return;
    if (Array.isArray(node)) {
      node.forEach((item, index) => visit(item, `${at}[${index}]`));
      return;
    }
    for (const [key, entry] of Object.entries(node)) {
      if (SECRET_KEY_PATTERN.test(key)) hits.push(at === "$" ? key : `${at}.${key}`);
      visit(entry, at === "$" ? key : `${at}.${key}`);
    }
  };
  visit(value, path);
  return hits;
}

/** Throw when a payload carries grant tokens or secrets. */
export function assertNoV2Secrets(value: unknown, label: string): void {
  const hits = findV2SecretKeys(value);
  if (hits.length > 0) {
    throw new Error(
      `${label} carries grant tokens or secrets at ${hits.join(", ")}; tokens stay in host-side grant storage and never enter definitions, logs, exports, or persisted state.`,
    );
  }
}
