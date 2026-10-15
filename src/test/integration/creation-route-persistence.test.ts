import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { callRoute } from "@/test/fixtures";
import type { TestDatabase } from "@/test/fixtures";
import { createTestDatabase } from "@/test/fixtures";
import { SqliteCollectionRepository } from "@/lib/database/collection-repository";
import { SqliteTagRepository } from "@/lib/database/tag-repository";

// Area: #293. Creating an organisation item is one durable operation. A
// Collection or Tag name and its colour are written together in a single
// create, an invalid colour is rejected before anything is written, and a
// create without a colour still works. Previously the route accepted only the
// name, so the client applied the colour with a follow-up PATCH whose failure
// was reported as success and could leave a name-only row behind.

const state = vi.hoisted(() => ({
  collections: null as SqliteCollectionRepository | null,
  tags: null as SqliteTagRepository | null,
}));

vi.mock("@/lib/db", () => ({
  // Reference/name reads the route and body reader perform.
  collectionExists: (id: string) => state.collections!.collectionExists(id),
  collectionNameExists: (name: string, exceptId?: string) =>
    state.collections!.collectionNameExists(name, exceptId),
  getAllCollections: () => state.collections!.getAllCollections(),
  getAllTags: () => state.tags!.getAllTags(),
  getFileById: () => null,
  // The durable writes under test.
  createCollection: (
    name: string,
    isSmart?: boolean,
    filter?: string,
    color?: string | null,
  ) => state.collections!.createCollection(name, isSmart, filter, color),
  createTag: (name: string, color?: string | null) =>
    state.tags!.createTag(name, color),
  // Unused by these routes but imported through the same module.
  attachFileToCollection: () => {},
  detachFileFromCollection: () => {},
  convertToRegularCollection: () => {},
  deleteCollection: () => {},
  getFiles: () => [],
  getSmartCollectionCount: () => null,
  renameCollection: () => {},
  updateCollectionColor: () => {},
  updateCollectionFilter: () => {},
  attachTagToFile: () => {},
  deleteTag: () => {},
  detachTagFromFile: () => {},
  getTagsForFile: () => [],
  renameTag: () => {},
  updateTagColor: () => {},
}));

import { POST as postCollections } from "@/app/api/collections/route";
import { POST as postTags } from "@/app/api/tags/route";

const COLLECTIONS_URL = "http://localhost/api/collections";
const TAGS_URL = "http://localhost/api/tags";

describe("creation route persistence (#293)", () => {
  let sqlite: TestDatabase;

  beforeEach(() => {
    sqlite = createTestDatabase();
    state.collections = new SqliteCollectionRepository(sqlite);
    state.tags = new SqliteTagRepository(sqlite);
  });

  afterEach(() => {
    sqlite.close();
  });

  function row<T>(query: string, ...params: unknown[]): T {
    return sqlite.prepare(query).get(...params) as T;
  }

  it("writes a Collection name and colour in one durable create", async () => {
    const response = await callRoute(postCollections, {
      url: COLLECTIONS_URL,
      body: { name: "Impacts", color: "#f0503c" },
    });

    expect(response.status).toBe(200);
    expect(row("SELECT name, color FROM collections")).toEqual({
      name: "Impacts",
      color: "#f0503c",
    });
  });

  it("rejects an invalid Collection colour before writing anything", async () => {
    const response = await callRoute(postCollections, {
      url: COLLECTIONS_URL,
      body: { name: "Impacts", color: "red" },
    });

    expect(response.status).toBe(400);
    expect(row<{ n: number }>("SELECT COUNT(*) AS n FROM collections").n).toBe(0);
  });

  it("writes a Tag name and colour in one durable create", async () => {
    const response = await callRoute(postTags, {
      url: TAGS_URL,
      body: { name: "Loud", color: "#7ab8ff" },
    });

    expect(response.status).toBe(200);
    expect(row("SELECT name, color FROM tags")).toEqual({
      name: "Loud",
      color: "#7ab8ff",
    });
  });

  it("rejects an invalid Tag colour before writing anything", async () => {
    const response = await callRoute(postTags, {
      url: TAGS_URL,
      body: { name: "Loud", color: "#GGGGGG" },
    });

    expect(response.status).toBe(400);
    expect(row<{ n: number }>("SELECT COUNT(*) AS n FROM tags").n).toBe(0);
  });

  it("still creates a Collection or Tag without a colour", async () => {
    const collection = await callRoute(postCollections, {
      url: COLLECTIONS_URL,
      body: { name: "Plain" },
    });
    const tag = await callRoute(postTags, {
      url: TAGS_URL,
      body: { name: "Plain" },
    });

    expect(collection.status).toBe(200);
    expect(tag.status).toBe(200);
    expect(
      row<{ color: string | null }>(
        "SELECT color FROM collections WHERE name = 'Plain'",
      ).color,
    ).toBeNull();
    expect(
      row<{ color: string | null }>(
        "SELECT color FROM tags WHERE name = 'Plain'",
      ).color,
    ).toBeNull();
  });

  it("rejects a duplicate Collection without a partial colour write", async () => {
    await callRoute(postCollections, {
      url: COLLECTIONS_URL,
      body: { name: "Impacts", color: "#f0503c" },
    });

    const second = await callRoute(postCollections, {
      url: COLLECTIONS_URL,
      body: { name: "Impacts", color: "#e8c468" },
    });

    expect(second.status).toBe(409);
    expect(row<{ n: number }>("SELECT COUNT(*) AS n FROM collections").n).toBe(1);
    expect(
      row<{ color: string }>("SELECT color FROM collections WHERE name = 'Impacts'")
        .color,
    ).toBe("#f0503c");
  });

  it("surfaces a storage rejection for a duplicate Tag without a second row", async () => {
    await callRoute(postTags, {
      url: TAGS_URL,
      body: { name: "Loud", color: "#7ab8ff" },
    });

    // The tag route has no pre-check, so this exercises the real unique
    // constraint and the mutation error mapping.
    const second = await callRoute(postTags, {
      url: TAGS_URL,
      body: { name: "Loud", color: "#f0503c" },
    });

    expect(second.status).toBe(409);
    expect(row<{ n: number }>("SELECT COUNT(*) AS n FROM tags").n).toBe(1);
  });
});
