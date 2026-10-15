/**
 * Lazy smart-collection counts.
 *
 * The collections list endpoint omits the per-smart-collection COUNT(*)
 * scan, so the sidebar badge shows the last-known count instead of an
 * exact value on every render. Counts are computed lazily when a smart
 * collection is opened and cached per query string: two collections
 * saving the same search share one count round-trip.
 */

import { BoundedMap } from "@/lib/bounded-map";

export { extractSmartQuery } from "@/lib/smart-collection-filter";

function cacheKey(query: string): string {
  return query.trim();
}

/**
 * Upper bound on cached query strings (#316). Counts are one number per
 * distinct trimmed query the session has opened; without a bound a long
 * session retains a count for every search the user ever typed. Exported for
 * the suite.
 */
export const MAX_CACHED_SMART_COUNTS = 128;

/**
 * Per-query-string count cache shared by every smart collection, bounded to
 * the most recently used queries (#316). An evicted query is a refetch, never
 * a wrong badge.
 */
export class SmartCollectionCountCache {
  private counts = new BoundedMap<string, number>(MAX_CACHED_SMART_COUNTS);

  get(query: string): number | undefined {
    return this.counts.get(cacheKey(query));
  }

  set(query: string, count: number): void {
    this.counts.set(cacheKey(query), count);
  }

  clear(): void {
    this.counts.clear();
  }

  get size(): number {
    return this.counts.size;
  }
}

export interface SmartCountResponse {
  ok: boolean;
  json(): Promise<unknown>;
}

export type SmartCountFetch = (url: string) => Promise<SmartCountResponse>;

/**
 * Resolve the count for one smart collection, fetching lazily on open.
 * Returns the cached count without a round-trip when the query string
 * was already resolved; returns null when there is no query or the
 * endpoint fails.
 */
export async function fetchSmartCount(
  collectionId: string,
  query: string | null,
  cache: SmartCollectionCountCache,
  fetchImpl: SmartCountFetch,
): Promise<number | null> {
  if (query === null || cacheKey(query) === "") {
    return null;
  }
  const cached = cache.get(query);
  if (cached !== undefined) {
    return cached;
  }
  try {
    const res = await fetchImpl(
      `/api/collections?countFor=${encodeURIComponent(collectionId)}`,
    );
    if (!res.ok) {
      return null;
    }
    const data = (await res.json()) as { count?: unknown };
    if (typeof data.count !== "number") {
      return null;
    }
    cache.set(query, data.count);
    return data.count;
  } catch {
    return null;
  }
}
