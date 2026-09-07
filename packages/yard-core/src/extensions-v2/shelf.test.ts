import { describe, expect, it } from "vitest";

import {
  createV2ShelfOperations,
  denyV2ShelfOperations,
  V2OperationError,
  type V2ShelfFactoryArgs,
  type V2ShelfPorts,
} from "./index";

// Area: extension v2 E1 (#176). The shelf store is a per-extension
// scratchpad behind `library:read`: adds validate before writing
// (unindexed IDs reject with nothing stored), lists repair by pruning
// dead IDs and writing the repaired list back.

function setup(
  stored: string[] = [],
  live: string[] = ["a", "b", "c"],
  overrides?: Partial<V2ShelfFactoryArgs>,
) {
  const calls: string[] = [];
  const notified: string[] = [];
  let current = [...stored];
  const liveSet = new Set(live);
  const ports: V2ShelfPorts = {
    readIds: () => [...current],
    writeIds: (_extensionId, ids) => {
      calls.push("persist");
      current = [...ids];
    },
  };
  const operations = createV2ShelfOperations({
    extensionId: "sound-shelf-v2",
    effectivePermissions: ["library:read"],
    shelf: ports,
    isLiveFile: (fileId) => liveSet.has(fileId),
    notify: (scope) => {
      calls.push(`notify:${scope}`);
      notified.push(scope);
    },
    ...overrides,
  });
  return { operations, calls, notified, current: () => current };
}

describe("v2 shelf permission confinement", () => {
  it("denies every command without library:read", () => {
    const { operations } = setup([], ["a"], { effectivePermissions: [] });
    expect(() => operations.list()).toThrowError(/"library:read"/);
    expect(() => operations.add(["a"])).toThrowError(/"library:read"/);
    expect(() => operations.remove(["a"])).toThrowError(/"library:read"/);
    expect(() => operations.clear()).toThrowError(/"library:read"/);
  });

  it("denies closed hosts without shelf ports", () => {
    const denied = denyV2ShelfOperations("sound-shelf-v2");
    expect(() => denied.list()).toThrowError(/"library:read"/);
    expect(() => denied.add(["a"])).toThrowError(/"library:read"/);
  });

  it("keeps shelves isolated between extensions", () => {
    const stores = new Map<string, string[]>([["ext-one", ["a"]]]);
    const ports: V2ShelfPorts = {
      readIds: (extensionId) => [...(stores.get(extensionId) ?? [])],
      writeIds: (extensionId, ids) => {
        stores.set(extensionId, [...ids]);
      },
    };
    const first = createV2ShelfOperations({
      extensionId: "ext-one",
      effectivePermissions: ["library:read"],
      shelf: ports,
      isLiveFile: () => true,
    });
    const second = createV2ShelfOperations({
      extensionId: "ext-two",
      effectivePermissions: ["library:read"],
      shelf: ports,
      isLiveFile: () => true,
    });
    expect(second.list().ids).toEqual([]);
    second.add(["a"]);
    expect(first.list().ids).toEqual(["a"]);
  });
});

describe("v2 shelf add", () => {
  it("adds live sounds and persists before notifying", () => {
    const { operations, calls, current } = setup(["a"]);
    const result = operations.add(["b", "b", "c"]);
    expect(result).toEqual({ added: 2, total: 3 });
    expect(current()).toEqual(["a", "b", "c"]);
    expect(calls).toEqual(["persist", "notify:shelf"]);
  });

  it("rejects unindexed IDs before writing anything", () => {
    const { operations, calls, current } = setup(["a"]);
    expect(() => operations.add(["b", "gone"])).toThrowError(/not in the Library index/);
    expect(current()).toEqual(["a"]);
    expect(calls).toEqual([]);
  });

  it("rejects empty adds and enforces the scratchpad bound", () => {
    const { operations } = setup();
    expect(() => operations.add([])).toThrowError(/at least one sound/);
    expect(() => operations.add(["  "])).toThrowError(/non-empty strings/);
  });

  it("skips the write when nothing changes", () => {
    const { operations, calls } = setup(["a"]);
    expect(operations.add(["a"])).toEqual({ added: 0, total: 1 });
    expect(calls).toEqual([]);
  });
});

describe("v2 shelf list repair", () => {
  it("prunes dead IDs, writes the repaired list, then notifies", () => {
    const { operations, calls, current } = setup(["a", "gone", "removed"], ["a"]);
    const result = operations.list();
    expect(result).toEqual({ ids: ["a"], repaired: ["gone", "removed"] });
    expect(current()).toEqual(["a"]);
    expect(calls).toEqual(["persist", "notify:shelf"]);
  });

  it("leaves a healthy shelf untouched", () => {
    const { operations, calls } = setup(["a", "b"]);
    expect(operations.list()).toEqual({ ids: ["a", "b"], repaired: [] });
    expect(calls).toEqual([]);
  });
});

describe("v2 shelf remove and clear", () => {
  it("removes selected IDs and persists before notifying", () => {
    const { operations, calls, current } = setup(["a", "b", "c"]);
    expect(operations.remove(["b", "missing"])).toEqual({ removed: 1, total: 2 });
    expect(current()).toEqual(["a", "c"]);
    expect(calls).toEqual(["persist", "notify:shelf"]);
  });

  it("clears the shelf and reports the count", () => {
    const { operations, calls, current } = setup(["a", "b"]);
    expect(operations.clear()).toEqual({ removed: 2 });
    expect(current()).toEqual([]);
    expect(calls).toEqual(["persist", "notify:shelf"]);
  });

  it("skips writes for no-op remove and clear", () => {
    const { operations, calls } = setup(["a"]);
    expect(operations.remove(["missing"])).toEqual({ removed: 0, total: 1 });
    const empty = setup([]);
    expect(empty.operations.clear()).toEqual({ removed: 0 });
    expect(calls).toEqual([]);
    expect(empty.calls).toEqual([]);
  });

  it("rejects blank remove IDs structurally", () => {
    const { operations } = setup(["a"]);
    expect(() => operations.remove(["  "])).toThrowError(V2OperationError);
  });
});
