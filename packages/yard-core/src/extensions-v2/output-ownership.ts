/**
 * Output ownership for v2 operation services (Yard Core context, R3).
 *
 * Extension output is claimed by exclusive creation: a copy, a text
 * write, and a ZIP archive each create a brand-new entry, so a
 * pre-existing file is never truncated and two concurrent jobs can
 * never both own one destination — the create *is* the claim, which is
 * why no in-process reservation table is needed (and why a crashed job
 * cannot strand a claim the way a leaked reservation would).
 *
 * Every created entry reports a `V2FileVersion`: the identity the port
 * captured at creation. Cleanup compares the version before removing a
 * path, so a replacement that appeared at a previously owned path
 * (another writer, another job, the user) survives. Paths are not
 * identity: the version is.
 *
 * Framework-free: no direct filesystem imports, so the policy runs
 * identically against the application adapter and the in-memory fakes.
 */

/**
 * Identity of one created entry, captured from the creating handle.
 * Stringified because filesystem ids are 64-bit on Windows (the file
 * index) and 32-bit or 64-bit elsewhere; a number would round.
 */
export type V2FileVersion = {
  /** Filesystem device / volume identifier. */
  device: string;
  /** Entry identifier within that device. */
  fileId: string;
};

/** Stable discriminator so a re-evaluated core bundle still recognizes a conflict. */
export const V2_OUTPUT_CONFLICT_CODE = "v2-output-conflict";

/**
 * Thrown by a file port when exclusive creation loses to an existing
 * entry. Carries the destination so the operation services can report
 * the documented conflict outcome; the stable `code` (not `instanceof`)
 * is what they match, because Next compiles each route into its own
 * bundle and a class identity would not survive that.
 */
export class V2OutputConflictError extends Error {
  readonly code = V2_OUTPUT_CONFLICT_CODE;

  constructor(readonly destPath: string) {
    super(
      `Output ${JSON.stringify(destPath)} already exists; extension outputs are created exclusively and existing files are never overwritten.`,
    );
    this.name = "V2OutputConflictError";
  }
}

export function isV2OutputConflict(error: unknown): error is V2OutputConflictError {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === V2_OUTPUT_CONFLICT_CODE
  );
}

/** True when both versions name the same created entry. */
export function sameV2FileVersion(a: V2FileVersion, b: V2FileVersion): boolean {
  return a.device === b.device && a.fileId === b.fileId;
}
