import { describe, expect, it } from "vitest";

import type { Collection } from "../domain/collection";
import type { Tag } from "../domain/tag";
import {
  createV2CollectionOperations,
  createV2TagOperations,
  denyV2OrganizationOperations,
  V2OperationError,
  type V2CollectionPorts,
  type V2OrganizationFactoryArgs,
  type V2TagPorts,
} from "./index";

// Area: extension v2 E1 (#176). Collections/tags read behind
// `collections:read`/`tags:read`, write behind
// `collections:write`/`tags:write`. Membership writes resolve the
// target against the Library index first (removed sounds reject).
// Mutations persist before notifying.

function setup(overrides?: Partial<V2OrganizationFactoryArgs>) {
  const calls: string[] = [];
  const notified: string[] = [];
  const collections = new Map<string, Collection>([
    ["c1", { id: "c1", name: "Evening", isSmart: false, filter: null, fileCount: 0 }],
  ]);
  const membership = new Set<string>();
  const tags = new Map<string, Tag>([["t1", { id: "t1", name: "field" }]]);
  const tagLinks = new Set<string>();
  const collectionPorts: V2CollectionPorts = {
    list: () => [...collections.values()],
    get: (id) => collections.get(id) ?? null,
    createSmart: (name, filter) => {
      calls.push("persist:collections");
      const id = `c${collections.size + 1}`;
      collections.set(id, { id, name, isSmart: true, filter, fileCount: 0 });
      return id;
    },
    updateSmartFilter: (id, filter) => {
      calls.push("persist:collections");
      collections.set(id, { ...collections.get(id)!, filter });
    },
    attachFile: (fileId, collectionId) => {
      calls.push("persist:collections");
      membership.add(`${collectionId}:${fileId}`);
    },
    detachFile: (fileId, collectionId) => {
      calls.push("persist:collections");
      membership.delete(`${collectionId}:${fileId}`);
    },
    deleteCollection: (id) => {
      calls.push("persist:collections");
      collections.delete(id);
    },
  };
  const tagPorts: V2TagPorts = {
    list: () => [...tags.values()],
    tagsForFile: (fileId) =>
      [...tagLinks].filter((link) => link.endsWith(`:${fileId}`)).map((link) => tags.get(link.split(":")[0]!)!),
    create: (name) => {
      calls.push("persist:tags");
      const id = `t${tags.size + 1}`;
      tags.set(id, { id, name });
      return id;
    },
    attach: (fileId, tagId) => {
      calls.push("persist:tags");
      tagLinks.add(`${tagId}:${fileId}`);
    },
    detach: (fileId, tagId) => {
      calls.push("persist:tags");
      tagLinks.delete(`${tagId}:${fileId}`);
    },
  };
  const live = new Set(["a"]);
  const notify = (scope: "collections" | "tags"): void => {
    calls.push(`notify:${scope}`);
    notified.push(scope);
  };
  const base: V2OrganizationFactoryArgs = {
    extensionId: "smart-collections-v2",
    effectivePermissions: ["collections:read", "collections:write", "tags:read", "tags:write", "library:read"],
    collections: collectionPorts,
    tags: tagPorts,
    isLiveFile: (fileId) => live.has(fileId),
    notify,
    ...overrides,
  };
  return {
    collections: createV2CollectionOperations(base),
    tags: createV2TagOperations(base),
    calls,
    notified,
    membership,
    tagLinks,
    live,
    store: collections,
  };
}

describe("v2 organization permission confinement", () => {
  it("denies reads and writes without their permission", () => {
    const { collections, tags } = setup({ effectivePermissions: [] });
    expect(() => collections.list()).toThrowError(/"collections:read"/);
    expect(() => collections.createSmart("Night", "night")).toThrowError(/"collections:write"/);
    expect(() => tags.list()).toThrowError(/"tags:read"/);
    expect(() => tags.create("night")).toThrowError(/"tags:write"/);
  });

  it("denies membership writes when the index read lapses", () => {
    const { collections, tags } = setup({
      effectivePermissions: ["collections:write", "tags:write"],
    });
    expect(() => collections.attachFile("a", "c1")).toThrowError(/"library:read"/);
    expect(() => tags.attach("a", "t1")).toThrowError(/"library:read"/);
  });

  it("denies closed hosts without organization ports", () => {
    const denied = denyV2OrganizationOperations("smart-collections-v2");
    expect(() => denied.collections.list()).toThrowError(/"collections:read"/);
    expect(() => denied.tags.list()).toThrowError(/"collections:read"/);
  });
});

describe("v2 collections", () => {
  it("creates smart Collections and persists before notifying", () => {
    const { collections, calls } = setup();
    const created = collections.createSmart("Night", "night");
    expect(created.id).toBe("c2");
    expect(collections.get("c2")?.filter).toBe("night");
    expect(calls).toEqual(["persist:collections", "notify:collections"]);
  });

  it("rejects blank names and empty filters, never a silent empty", () => {
    const { collections, store } = setup();
    expect(() => collections.createSmart("  ", "night")).toThrowError(/non-empty string/);
    expect(() => collections.createSmart("Night", "   ")).toThrowError(/non-empty query/);
    expect(store.size).toBe(1);
  });

  it("attaches live sounds and rejects removed targets", () => {
    const { collections, membership } = setup();
    collections.attachFile("a", "c1");
    expect(membership.has("c1:a")).toBe(true);
    expect(() => collections.attachFile("gone", "c1")).toThrowError(/not in the Library index/);
    expect(() => collections.attachFile("a", "missing")).toThrowError(/does not exist/);
    expect(membership.has("c1:gone")).toBe(false);
  });

  it("rejects unknown Collections on update and delete", () => {
    const { collections } = setup();
    expect(() => collections.updateSmartFilter("missing", "night")).toThrowError(/does not exist/);
    expect(() => collections.deleteCollection("missing")).toThrowError(/does not exist/);
  });

  it("detaches and deletes with notification after persist", () => {
    const { collections, calls, membership } = setup();
    collections.attachFile("a", "c1");
    collections.detachFile("a", "c1");
    expect(membership.has("c1:a")).toBe(false);
    collections.deleteCollection("c1");
    expect(collections.get("c1")).toBeNull();
    expect(calls.filter((call) => call === "notify:collections")).toHaveLength(3);
    expect(calls[0]).toBe("persist:collections");
  });
});

describe("v2 tags", () => {
  it("creates and links tags with notification after persist", () => {
    const { tags, calls, tagLinks } = setup();
    const created = tags.create("night");
    expect(created.id).toBe("t2");
    tags.attach("a", "t2");
    expect(tagLinks.has("t2:a")).toBe(true);
    expect(tags.tagsForFile("a").map((tag) => tag.name)).toEqual(["night"]);
    expect(calls).toEqual([
      "persist:tags",
      "notify:tags",
      "persist:tags",
      "notify:tags",
    ]);
  });

  it("rejects blank tag names and removed attach targets", () => {
    const { tags, tagLinks } = setup();
    expect(() => tags.create("  ")).toThrowError(/non-empty string/);
    expect(() => tags.attach("gone", "t1")).toThrowError(/not in the Library index/);
    expect(tagLinks.size).toBe(0);
  });

  it("detaches without touching other links", () => {
    const { tags, tagLinks, live } = setup();
    live.add("b");
    tags.attach("a", "t1");
    tags.attach("b", "t1");
    tags.detach("a", "t1");
    expect(tagLinks.has("t1:a")).toBe(false);
    expect(tagLinks.has("t1:b")).toBe(true);
  });

  it("rejects non-serializable names structurally", () => {
    const { tags } = setup();
    expect(() => tags.create(42 as unknown as string)).toThrowError(V2OperationError);
  });
});
