import { describe, expect, it } from "vitest";

import { BoundedMap } from "./bounded-map";

// Area: #316. Every in-memory cache shares one eviction policy: a hard entry
// bound that drops the least-recently-used entry, proven under sustained
// insertion rather than only at the boundary.

describe("BoundedMap", () => {
  it("rejects a limit that cannot bound anything", () => {
    expect(() => new BoundedMap<string, number>(0)).toThrowError(/positive integer/);
    expect(() => new BoundedMap<string, number>(-1)).toThrowError(/positive integer/);
    expect(() => new BoundedMap<string, number>(1.5)).toThrowError(/positive integer/);
  });

  it("holds entries up to the limit", () => {
    const map = new BoundedMap<string, number>(3);
    map.set("a", 1);
    map.set("b", 2);
    map.set("c", 3);
    expect(map.size).toBe(3);
    expect(map.get("a")).toBe(1);
    expect(map.get("b")).toBe(2);
    expect(map.get("c")).toBe(3);
  });

  it("evicts the oldest entry when insertion passes the limit", () => {
    const map = new BoundedMap<string, number>(3);
    map.set("a", 1);
    map.set("b", 2);
    map.set("c", 3);
    map.set("d", 4);
    expect(map.size).toBe(3);
    expect(map.has("a")).toBe(false);
    expect(map.get("d")).toBe(4);
  });

  it("keeps size at the limit under sustained insertion", () => {
    const map = new BoundedMap<string, number>(8);
    for (let index = 0; index < 500; index += 1) {
      map.set(`key-${index}`, index);
    }
    expect(map.size).toBe(8);
    // The newest entries survive; everything older aged out.
    expect(map.get("key-499")).toBe(499);
    expect(map.get("key-0")).toBeUndefined();
    expect(map.get("key-491")).toBeUndefined();
  });

  it("protects a recently read entry from eviction", () => {
    const map = new BoundedMap<string, number>(2);
    map.set("a", 1);
    map.set("b", 2);
    // Reading `a` makes it most-recently used, so `b` is the eviction victim.
    expect(map.get("a")).toBe(1);
    map.set("c", 3);
    expect(map.get("a")).toBe(1);
    expect(map.has("b")).toBe(false);
    expect(map.size).toBe(2);
  });

  it("re-writing an existing key refreshes it without growing", () => {
    const map = new BoundedMap<string, number>(2);
    map.set("a", 1);
    map.set("b", 2);
    map.set("a", 10);
    expect(map.size).toBe(2);
    map.set("c", 3);
    expect(map.get("a")).toBe(10);
    expect(map.has("b")).toBe(false);
  });

  it("returns undefined for a missing key and reports emptiness", () => {
    const map = new BoundedMap<string, number>(2);
    expect(map.get("missing")).toBeUndefined();
    expect(map.size).toBe(0);
    map.set("a", 1);
    map.delete("a");
    map.delete("missing");
    expect(map.size).toBe(0);
    map.set("b", 2);
    map.clear();
    expect(map.size).toBe(0);
    expect(map.get("b")).toBeUndefined();
  });
});
