/**
 * Destination grants for v2 operations (Yard Core context, R3).
 *
 * Readable Library roots and writable destination grants stay distinct:
 * Library reads authorize against configured roots (see `filesystem.ts`),
 * while every output write authorizes against a grant issued to the
 * calling extension. A grant names a canonical root directory, the
 * extension it was issued to, and an expiry. Missing, expired, foreign
 * (issued to another extension), or insufficient (operation outside the
 * grant root) grants are denied.
 *
 * Grant tokens (the opaque strings the desktop picker returns) never
 * enter this module: the application holds the token-to-grant mapping
 * in memory and hands the host a grant ID. Persisted records keep the
 * grant ID and ownership metadata only, so a restart expires usable
 * access while leaving reviewable history behind.
 */

export type V2DestinationGrant = {
  grantId: string;
  extensionId: string;
  /** Canonical absolute root directory the grant covers. */
  rootPath: string;
  grantedAt: string;
  /** ISO timestamp; absent means no expiry. Expired grants deny. */
  expiresAt?: string;
};

export type V2GrantAuthorization =
  | { ok: true; grant: V2DestinationGrant }
  | { ok: false; reason: "grant-missing" | "grant-expired" | "grant-foreign"; message: string };

let grantCounter = 0;

function createGrantId(): string {
  const cryptoRef = (
    globalThis as { crypto?: { randomUUID?: () => string } }
  ).crypto;
  if (cryptoRef?.randomUUID) return `vgrant_${cryptoRef.randomUUID()}`;
  grantCounter += 1;
  return `vgrant_fallback-${Date.now().toString(36)}-${grantCounter.toString(36)}`;
}

/** In-memory grant storage. The application owns token mapping and restart expiry. */
export class V2GrantStore {
  private readonly grants = new Map<string, V2DestinationGrant>();

  constructor(private readonly clock: () => string = () => new Date().toISOString()) {}

  issue(
    extensionId: string,
    rootPath: string,
    options?: { expiresAt?: string },
  ): V2DestinationGrant {
    const grant: V2DestinationGrant = {
      grantId: createGrantId(),
      extensionId,
      rootPath,
      grantedAt: this.clock(),
      ...(options?.expiresAt !== undefined ? { expiresAt: options.expiresAt } : {}),
    };
    this.grants.set(grant.grantId, grant);
    return { ...grant };
  }

  revoke(grantId: string): void {
    this.grants.delete(grantId);
  }

  /** Drop every expired grant; the application also calls this on restart. */
  pruneExpired(now?: string): number {
    const at = now ?? this.clock();
    let removed = 0;
    for (const [id, grant] of this.grants) {
      if (grant.expiresAt !== undefined && grant.expiresAt <= at) {
        this.grants.delete(id);
        removed += 1;
      }
    }
    return removed;
  }

  authorize(
    grantId: string | undefined,
    extensionId: string,
    now?: string,
  ): V2GrantAuthorization {
    if (!grantId) {
      return {
        ok: false,
        reason: "grant-missing",
        message: `Extension "${extensionId}" needs a destination grant for this output; choose an output folder first.`,
      };
    }
    const grant = this.grants.get(grantId);
    if (!grant) {
      return {
        ok: false,
        reason: "grant-missing",
        message: `Destination grant "${grantId}" is unknown or was revoked; choose an output folder again.`,
      };
    }
    if (grant.extensionId !== extensionId) {
      return {
        ok: false,
        reason: "grant-foreign",
        message: `Destination grant "${grantId}" belongs to another extension; each extension needs its own output grant.`,
      };
    }
    const at = now ?? this.clock();
    if (grant.expiresAt !== undefined && grant.expiresAt <= at) {
      return {
        ok: false,
        reason: "grant-expired",
        message: `Destination grant "${grantId}" expired at ${grant.expiresAt}; choose an output folder again.`,
      };
    }
    return { ok: true, grant: { ...grant } };
  }
}
