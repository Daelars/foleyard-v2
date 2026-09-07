/**
 * Readable source grants for v2 operations (Yard Core context, E1 #176).
 *
 * Destination grants (`grants.ts`) cover writable output folders. Library
 * Gatherer v2 reads external source folders that sit outside the
 * configured Library roots, and Folder Janitor v2 scans folders the
 * user picks at runtime: neither is readable through the root check in
 * `filesystem.ts` alone. A source grant names a canonical root
 * directory an extension may read, the extension it was issued to, and
 * an expiry. Missing, expired, foreign (issued to another extension),
 * or revoked grants are denied.
 *
 * Readable Library roots and source grants stay distinct from writable
 * destination grants: a source grant never authorizes a write, and a
 * destination grant never authorizes a source read. Grant tokens (the
 * opaque strings the desktop picker returns) never enter this module:
 * the application holds the token-to-grant mapping in memory and hands
 * the host a grant ID. Persisted records keep the grant ID and
 * ownership metadata only, so a restart expires usable access while
 * leaving reviewable history behind.
 */

export type V2SourceGrant = {
  grantId: string;
  extensionId: string;
  /** Canonical absolute root directory the grant covers for reading. */
  rootPath: string;
  grantedAt: string;
  /** ISO timestamp; absent means no expiry. Expired grants deny. */
  expiresAt?: string;
};

export type V2SourceGrantAuthorization =
  | { ok: true; grant: V2SourceGrant }
  | { ok: false; reason: "grant-missing" | "grant-expired" | "grant-foreign"; message: string };

let sourceGrantCounter = 0;

function createSourceGrantId(): string {
  const cryptoRef = (
    globalThis as { crypto?: { randomUUID?: () => string } }
  ).crypto;
  if (cryptoRef?.randomUUID) return `vsrc_${cryptoRef.randomUUID()}`;
  sourceGrantCounter += 1;
  return `vsrc_fallback-${Date.now().toString(36)}-${sourceGrantCounter.toString(36)}`;
}

/** In-memory source-grant storage. The application owns token mapping and restart expiry. */
export class V2SourceGrantStore {
  private readonly grants = new Map<string, V2SourceGrant>();

  constructor(private readonly clock: () => string = () => new Date().toISOString()) {}

  issue(
    extensionId: string,
    rootPath: string,
    options?: { expiresAt?: string },
  ): V2SourceGrant {
    const grant: V2SourceGrant = {
      grantId: createSourceGrantId(),
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
  ): V2SourceGrantAuthorization {
    if (!grantId) {
      return {
        ok: false,
        reason: "grant-missing",
        message: `Extension "${extensionId}" needs a readable source grant for this folder; choose a source folder first.`,
      };
    }
    const grant = this.grants.get(grantId);
    if (!grant) {
      return {
        ok: false,
        reason: "grant-missing",
        message: `Source grant "${grantId}" is unknown or was revoked; choose a source folder again.`,
      };
    }
    if (grant.extensionId !== extensionId) {
      return {
        ok: false,
        reason: "grant-foreign",
        message: `Source grant "${grantId}" belongs to another extension; each extension needs its own source grant.`,
      };
    }
    const at = now ?? this.clock();
    if (grant.expiresAt !== undefined && grant.expiresAt <= at) {
      return {
        ok: false,
        reason: "grant-expired",
        message: `Source grant "${grantId}" expired at ${grant.expiresAt}; choose a source folder again.`,
      };
    }
    return { ok: true, grant: { ...grant } };
  }
}
