/**
 * Lazy smart-collection counts.
 *
 * The collections list endpoint omits the per-smart-collection COUNT(*)
 * scan, so the sidebar badge shows the last-known count instead of an
 * exact value on every render. Counts are computed lazily when a smart
 * collection is opened and cached per query string: two collections
 * saving the same search share one count round-trip.
 */

export { extractSmartQuery } from "@/lib/smart-collection-filter";

function cacheKey(query: string): string {
  return query.trim();
}

/** Per-query-string count cache shared by every smart collection. */
export class SmartCollectionCountCache {
  private counts = new Map<string, number>();

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
