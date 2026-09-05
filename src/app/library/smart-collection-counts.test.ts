import { describe, expect, it, vi } from "vitest";

import {
  SmartCollectionCountCache,
  extractSmartQuery,
  fetchSmartCount,
} from "./smart-collection-counts";

describe("extractSmartQuery", () => {
  it("returns the trimmed query from a smart-collection filter", () => {
    expect(extractSmartQuery(JSON.stringify({ q: "  rain  " }))).toBe("rain");
  });

  it("returns null for missing, empty, or invalid filters", () => {
    expect(extractSmartQuery(null)).toBeNull();
    expect(extractSmartQuery(undefined)).toBeNull();
    expect(extractSmartQuery(JSON.stringify({}))).toBeNull();
    expect(extractSmartQuery(JSON.stringify({ q: "   " }))).toBeNull();
    expect(extractSmartQuery("not-json")).toBeNull();
  });
});

describe("smart-collection count cache", () => {
  it("is keyed per query string, not per collection", () => {
    const cache = new SmartCollectionCountCache();
    cache.set("rain", 7);
    expect(cache.get("rain")).toBe(7);
    expect(cache.get("  rain  ")).toBe(7);
    expect(cache.get("wind")).toBeUndefined();
  });

  it("fetches once per query string across repeated opens", async () => {
    const cache = new SmartCollectionCountCache();
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({ count: 12 }),
    }));
    const first = await fetchSmartCount("id-a", "rain", cache, fetchImpl);
    const second = await fetchSmartCount("id-b", "rain", cache, fetchImpl);
    expect(first).toBe(12);
    expect(second).toBe(12);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledWith(
      "/api/collections?countFor=id-a",
    );
  });

  it("returns null without fetching when there is no query", async () => {
    const cache = new SmartCollectionCountCache();
    const fetchImpl = vi.fn();
    expect(await fetchSmartCount("id-a", null, cache, fetchImpl)).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("returns null when the count endpoint fails", async () => {
    const cache = new SmartCollectionCountCache();
    const fetchImpl = vi.fn(async () => ({
      ok: false,
      json: async () => ({}),
    }));
    expect(await fetchSmartCount("id-a", "rain", cache, fetchImpl)).toBeNull();
    expect(cache.get("rain")).toBeUndefined();
  });
});
