/**
 * The Library's file-identity signal (#269, #274): size and modification
 * time, both recorded truncated to whole milliseconds by the scanner.
 *
 * Permanent deletion validates the on-disk entry against this signal before
 * unlinking (#269), and scan move reconciliation uses it to decide whether a
 * removed path and a newly discovered path are the same recording that moved
 * (#274). Content is deliberately not hashed during a scan: full or partial
 * hashing is too expensive at Library scale, and hashing is reserved for an
 * explicit, user-initiated confirmation of an already-ambiguous case.
 *
 * A null on either side is never a match: two entries only share identity
 * when both size and mtime are known and equal. That is what keeps a
 * replacement from inheriting a removed recording's organization data.
 */
export type FileIdentity = {
  fileSize: number | null;
  mtimeMs: number | null;
};

export function isSameFileIdentity(a: FileIdentity, b: FileIdentity): boolean {
  return (
    a.fileSize !== null &&
    b.fileSize !== null &&
    a.mtimeMs !== null &&
    b.mtimeMs !== null &&
    a.fileSize === b.fileSize &&
    a.mtimeMs === b.mtimeMs
  );
}
