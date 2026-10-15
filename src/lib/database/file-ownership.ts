/**
 * The single ownership predicate every Library read shares (#271, #309).
 *
 * A file row is *owned* when the user has not soft-removed it (the file is
 * still expected on disk) and its Library root has not been detached. Removing
 * a root marks its files detached: the rows survive with their tags,
 * favourites, Collection membership and embeddings, but every Library read —
 * browse, search, counts, playback, waveform, Collection and tag surfaces —
 * agrees they are not owned until the root is re-added.
 *
 * The second half of the same contract is *which* root owns a file. When
 * configured roots overlap, the most specific (deepest) configured root that
 * contains the file owns it (`resolveOwningRoot`); the scanner writes that
 * owner and the root-removal service re-resolves it, so browse, directory
 * navigation and root filters can never disagree about the owner. Both the
 * Drizzle form and the raw-SQL text come from the canonical strings below, so
 * no call site can drift from the contract by hand-writing its own
 * `removed_at`/`detached_at` clause.
 */
import path from "node:path";

import { sql, type SQL } from "drizzle-orm";

/** Normalize a configured Library root the way validation stores it. */
export function normalizeLibraryRoot(root: string): string {
  return path.resolve(root.trim());
}

/** True when `filePath` is the root itself or a descendant of it. */
export function isPathWithinRoot(root: string, filePath: string): boolean {
  const relative = path.relative(root, filePath);
  return (
    relative === "" ||
    (!path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`))
  );
}

/**
 * The most specific configured root that contains `filePath` (#309).
 *
 * Deepest normalized path wins. If two distinct configured roots normalize to
 * the same depth and both contain the file (only possible when they differ by
 * case or separators), the lexicographically smallest normalized path is the
 * documented tie-break. The result therefore never depends on the order the
 * roots were added or scanned. Returns `null` when no configured root contains
 * the file.
 */
export function resolveOwningRoot(filePath: string, roots: Iterable<string>): string | null {
  const normalizedFile = path.resolve(filePath);
  let winner: string | null = null;

  for (const root of roots) {
    const normalizedRoot = normalizeLibraryRoot(root);
    if (!isPathWithinRoot(normalizedRoot, normalizedFile)) {
      continue;
    }
    if (
      winner === null ||
      normalizedRoot.length > winner.length ||
      (normalizedRoot.length === winner.length && normalizedRoot < winner)
    ) {
      winner = normalizedRoot;
    }
  }

  return winner;
}

/**
 * The stored directory of a file relative to its owning root, or `null` when
 * the file sits directly at that root. Shared by the scanner and the
 * root-removal service so ownership and directory navigation always agree.
 */
export function directoryWithinRoot(ownerRoot: string, filePath: string): string | null {
  const relativeDirectory = path.relative(ownerRoot, path.dirname(filePath));
  return relativeDirectory === "." ? null : relativeDirectory || null;
}

/** Canonical "this row is owned" predicate text. Default alias is `files`. */
export function ownedFileWhere(alias = "files"): string {
  return `${alias}.removed_at IS NULL AND ${alias}.detached_at IS NULL`;
}

/**
 * Canonical "this row is not detached" predicate text. Used by the few reads
 * that deliberately include soft-removed rows: detached rows stay invisible.
 */
export function notDetachedWhere(alias = "files"): string {
  return `${alias}.detached_at IS NULL`;
}

/** Drizzle condition for {@link ownedFileWhere}. */
export function ownedFileFilter(alias = "files"): SQL {
  return sql.raw(ownedFileWhere(alias));
}

/** Drizzle condition for {@link notDetachedWhere}. */
export function notDetachedFilter(alias = "files"): SQL {
  return sql.raw(notDetachedWhere(alias));
}
