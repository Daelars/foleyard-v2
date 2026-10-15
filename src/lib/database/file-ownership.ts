/**
 * The single ownership predicate every Library read shares (#271).
 *
 * A file row is *owned* when the user has not soft-removed it (the file is
 * still expected on disk) and its Library root has not been detached. Removing
 * a root marks its files detached: the rows survive with their tags,
 * favourites, Collection membership and embeddings, but every Library read —
 * browse, search, counts, playback, waveform, Collection and tag surfaces —
 * agrees they are not owned until the root is re-added.
 *
 * Both the Drizzle form and the raw-SQL text come from the canonical strings
 * below, so no call site can drift from the contract by hand-writing its own
 * `removed_at`/`detached_at` clause.
 */
import { sql, type SQL } from "drizzle-orm";

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
