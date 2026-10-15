/**
 * Single-use picker proofs (Yard Core context, #263).
 *
 * Destination (`grants.ts`) and source (`source-grants.ts`) grants record
 * what an extension may write or read. A picker proof records that the
 * user actually chose a folder in the native desktop picker: only the
 * desktop process, authenticated with its startup secret, mints one, and
 * an extension grant route exchanges it — once — for a grant bound to
 * exactly one extension and one grant kind. A caller-supplied directory
 * path, or a forged, replayed, expired, or foreign proof, never issues a
 * grant, so a path is never consent on its own.
 *
 * Proofs stay in memory: they are never persisted, they die on restart,
 * and their expiry keeps a proof that is not spent promptly from becoming
 * standing access.
 */

export type V2PickerGrantKind = "source" | "destination";

export type V2PickerProof = {
  /** Opaque single-use proof the desktop picker hands to the renderer. */
  proof: string;
  /** The one extension this proof may issue a grant to. */
  extensionId: string;
  /** The one grant kind this proof may issue. */
  kind: V2PickerGrantKind;
  /** Canonical directory the user chose in the picker. */
  path: string;
  issuedAt: string;
  /** ISO timestamp; a proof at or past it denies and is dropped. */
  expiresAt: string;
};

export type V2PickerProofUse =
  | { ok: true; proof: V2PickerProof }
  | { ok: false; reason: "proof-missing" | "proof-expired" | "proof-foreign"; message: string };

/** A proof is meant to be spent immediately; a stale one is not consent. */
export const V2_PICKER_PROOF_TTL_MS = 5 * 60_000;

let proofCounter = 0;

function createProofId(): string {
  const cryptoRef = (
    globalThis as { crypto?: { randomUUID?: () => string } }
  ).crypto;
  if (cryptoRef?.randomUUID) return `vpick_${cryptoRef.randomUUID()}`;
  proofCounter += 1;
  return `vpick_fallback-${Date.now().toString(36)}-${proofCounter.toString(36)}`;
}

/** In-memory single-use picker proofs. The application owns minting and restart expiry. */
export class V2PickerProofStore {
  private readonly proofs = new Map<string, V2PickerProof>();

  constructor(private readonly clock: () => string = () => new Date().toISOString()) {}

  issue(
    extensionId: string,
    kind: V2PickerGrantKind,
    path: string,
    options?: { ttlMs?: number },
  ): V2PickerProof {
    const issuedAt = this.clock();
    const ttlMs = options?.ttlMs ?? V2_PICKER_PROOF_TTL_MS;
    const proof: V2PickerProof = {
      proof: createProofId(),
      extensionId,
      kind,
      path,
      issuedAt,
      expiresAt: new Date(Date.parse(issuedAt) + ttlMs).toISOString(),
    };
    this.proofs.set(proof.proof, proof);
    return { ...proof };
  }

  revoke(proof: string): void {
    this.proofs.delete(proof);
  }

  /** Drop every expired proof; a restart drops the whole store. */
  pruneExpired(now?: string): number {
    const at = now ?? this.clock();
    let removed = 0;
    for (const [id, proof] of this.proofs) {
      if (proof.expiresAt <= at) {
        this.proofs.delete(id);
        removed += 1;
      }
    }
    return removed;
  }

  /**
   * Spend a proof for exactly the intended extension and grant kind.
   * Only a match is consumed: a foreign caller is rejected without
   * burning the proof, and a missing, forged, replayed, or expired proof
   * is denied.
   */
  consume(
    proofId: string | undefined,
    extensionId: string,
    kind: V2PickerGrantKind,
    now?: string,
  ): V2PickerProofUse {
    if (!proofId) {
      return {
        ok: false,
        reason: "proof-missing",
        message: `Extension "${extensionId}" needs a folder-picker proof for this ${kind}; choose the folder with the desktop picker.`,
      };
    }
    const proof = this.proofs.get(proofId);
    if (!proof) {
      return {
        ok: false,
        reason: "proof-missing",
        message: `Picker proof "${proofId}" is unknown, already used, or expired; choose the folder again.`,
      };
    }
    if (proof.extensionId !== extensionId || proof.kind !== kind) {
      return {
        ok: false,
        reason: "proof-foreign",
        message: `Picker proof "${proofId}" was issued for another extension or grant kind; choose the folder again for this one.`,
      };
    }
    const at = now ?? this.clock();
    if (proof.expiresAt <= at) {
      this.proofs.delete(proofId);
      return {
        ok: false,
        reason: "proof-expired",
        message: `Picker proof "${proofId}" expired; choose the folder again.`,
      };
    }
    this.proofs.delete(proofId);
    return { ok: true, proof: { ...proof } };
  }
}
