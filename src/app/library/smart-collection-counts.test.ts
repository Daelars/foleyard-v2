import { describe, expect, it, vi } from "vitest";

import {
  fetchSmartCount,
  MAX_CACHED_SMART_COUNTS,
  SmartCollectionCountCache,
} from "./smart-collection-counts";

// Area: #316. The per-query-string smart count cache is browser state that
// lives for the whole session, so it must not retain a count for every query
// the user ever typed: the bound drops the least-recently-used query.

describe("SmartCollectionCountCache", () => {
  it("bounds distinct query strings and evicts the least-recently used", () => {
    const cache = new SmartCollectionCountCache();
    for (let index = 0; index < MAX_CACHED_SMART_COUNTS + 50; index += 1) {
      cache.set(`rain ${index}`, index);
    }
    expect(cache.size).toBe(MAX_CACHED_SMART_COUNTS);
    // The first queries aged out; the newest survive.
    expect(cache.get("rain 0")).toBeUndefined();
    expect(cache.get(`rain ${MAX_CACHED_SMART_COUNTS + 49}`)).toBe(
      MAX_CACHED_SMART_COUNTS + 49,
    );
  });

  it("keeps a query that was read between insertions", () => {
    const cache = new SmartCollectionCountCache();
    cache.set("keep me", 7);
    for (let index = 0; index < MAX_CACHED_SMART_COUNTS; index += 1) {
      expect(cache.get("keep me")).toBe(7);
      cache.set(`churn ${index}`, index);
    }
    expect(cache.get("keep me")).toBe(7);
    expect(cache.size).toBe(MAX_CACHED_SMART_COUNTS);
  });

  it("normalizes whitespace so one query is one entry", () => {
    const cache = new SmartCollectionCountCache();
    cache.set("  rain  ", 3);
    expect(cache.get("rain")).toBe(3);
    expect(cache.size).toBe(1);
  });
});

describe("fetchSmartCount eviction", () => {
  it("refetches a count whose query was evicted", async () => {
    const cache = new SmartCollectionCountCache();
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({ count: 11 }),
    }));

    await fetchSmartCount("id-a", "rain", cache, fetchImpl);
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    // Sustained distinct queries push "rain" out of the bounded cache.
    for (let index = 0; index < MAX_CACHED_SMART_COUNTS; index += 1) {
      await fetchSmartCount("id-a", `storm ${index}`, cache, fetchImpl);
    }
    expect(cache.size).toBe(MAX_CACHED_SMART_COUNTS);
    expect(cache.get("rain")).toBeUndefined();

    await fetchSmartCount("id-a", "rain", cache, fetchImpl);
    expect(fetchImpl).toHaveBeenCalledTimes(MAX_CACHED_SMART_COUNTS + 2);
  });
});
