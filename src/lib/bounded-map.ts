/**
 * Least-recently-used map with a hard entry bound (#316).
 *
 * In-memory caches that need an admission bound share this implementation, so
 * the eviction policy has one tested shape instead of a hand-rolled variant
 * per module. A read or a write marks its entry most-recently used; a write
 * past `limit` drops the oldest entry. The bound is a hard ceiling: `size`
 * never exceeds `limit`, so a cache cannot grow with the number of distinct
 * keys a long session happens to touch.
 *
 * Callers choose `limit` from what the cache holds (see each site): entry
 * counts that are cheap per entry get a wide bound, and a cache whose values
 * are hundreds of megabytes gets a narrow one.
 */
export class BoundedMap<K, V> {
  private readonly entries = new Map<K, V>();

  constructor(readonly limit: number) {
    if (!Number.isInteger(limit) || limit < 1) {
      throw new Error(`BoundedMap limit must be a positive integer, received ${limit}`);
    }
  }

  /** Value for `key`, marked most-recently used so it survives the next eviction. */
  get(key: K): V | undefined {
    const value = this.entries.get(key);
    if (value === undefined) return undefined;
    this.entries.delete(key);
    this.entries.set(key, value);
    return value;
  }

  /** Store `value`, evicting the oldest entries until the bound holds again. */
  set(key: K, value: V): void {
    this.entries.delete(key);
    this.entries.set(key, value);
    while (this.entries.size > this.limit) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
  }

  has(key: K): boolean {
    return this.entries.has(key);
  }

  delete(key: K): void {
    this.entries.delete(key);
  }

  clear(): void {
    this.entries.clear();
  }

  get size(): number {
    return this.entries.size;
  }
}
