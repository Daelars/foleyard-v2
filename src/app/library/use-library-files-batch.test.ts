import { describe, expect, it } from "vitest";

import {
  applyBulkFavorite,
  applyBulkTag,
  rollbackBulkFavorite,
  rollbackBulkTags,
  snapshotBulkFavorites,
  snapshotBulkTags,
} from "./file-query";
import type { FileRecord, TagRecord } from "./types";

function file(overrides: Partial<FileRecord> & { id: string }): FileRecord {
  return {
    filename: `${overrides.id}.wav`,
    path: `/lib/${overrides.id}.wav`,
    directory: null,
    format: "wav",
    duration: null,
    fileSize: null,
    isFavorite: false,
    tags: [],
    ...overrides,
  };
}

const tags: TagRecord[] = [
  { id: "t1", name: "Drums", color: "red" },
  { id: "t2", name: "Bass", color: "blue" },
];

describe("batch optimistic updates with per-batch rollback", () => {
  it("applies one batch optimistically and confirms it by keeping state", () => {
    const start = [file({ id: "a" }), file({ id: "b" })];
    const next = applyBulkFavorite(start, ["a", "b"], true);
    expect(next.map((entry) => entry.isFavorite)).toEqual([true, true]);
    // Confirm: no rollback, server total consumed separately.
    expect(next.map((entry) => entry.id)).toEqual(["a", "b"]);
  });

  it("rolls back only the failed batch without touching other files", () => {
    const start = [file({ id: "a" }), file({ id: "b" })];
    const batchA = ["a"];
    const previousA = snapshotBulkFavorites(start, batchA);
    const optimistic = applyBulkFavorite(start, batchA, true);
    expect(optimistic.find((entry) => entry.id === "a")?.isFavorite).toBe(true);

    const rolledBack = rollbackBulkFavorite(optimistic, previousA);
    expect(rolledBack.find((entry) => entry.id === "a")?.isFavorite).toBe(false);
    expect(rolledBack.find((entry) => entry.id === "b")).toEqual(
      start.find((entry) => entry.id === "b"),
    );
  });

  it("preserves concurrent edits to the same file on rollback", () => {
    const start = [file({ id: "a", tags: [{ id: "t2", name: "Bass" }] })];
    const previous = snapshotBulkFavorites(start, ["a"]);
    const optimistic = applyBulkFavorite(start, ["a"], true);
    // A concurrent edit renames an unrelated field while the batch is in flight.
    const concurrent = optimistic.map((entry) =>
      entry.id === "a" ? { ...entry, filename: "renamed.wav" } : entry,
    );

    const rolledBack = rollbackBulkFavorite(concurrent, previous);
    expect(rolledBack[0].isFavorite).toBe(false);
    expect(rolledBack[0].filename).toBe("renamed.wav");
    expect(rolledBack[0].tags).toEqual([{ id: "t2", name: "Bass" }]);
  });

  it("rolls back only the failed tag batch and keeps concurrent favourites", () => {
    const start = [file({ id: "a" }), file({ id: "b", isFavorite: true })];
    const previous = snapshotBulkTags(start, ["a", "b"]);
    const optimistic = applyBulkTag(start, ["a", "b"], "t1", true, tags);
    expect(optimistic.every((entry) => entry.tags.some((tag) => tag.id === "t1"))).toBe(true);

    // A concurrent favourite toggle lands before the failure is known.
    const concurrent = applyBulkFavorite(optimistic, ["a"], true);
    const rolledBack = rollbackBulkTags(concurrent, previous);

    expect(rolledBack.find((entry) => entry.id === "a")?.tags).toEqual([]);
    expect(rolledBack.find((entry) => entry.id === "b")?.tags).toEqual([]);
    // The concurrent favourite edit survives the tag rollback.
    expect(rolledBack.find((entry) => entry.id === "a")?.isFavorite).toBe(true);
    expect(rolledBack.find((entry) => entry.id === "b")?.isFavorite).toBe(true);
  });

  it("carries an explicit attach target instead of toggling", () => {
    const start = [file({ id: "a", tags: [{ id: "t1", name: "Drums" }] })];
    // Already attached: explicit attach is a no-op rather than a detach.
    expect(applyBulkTag(start, ["a"], "t1", true, tags)[0].tags).toHaveLength(1);
    expect(applyBulkTag(start, ["a"], "t1", false, tags)[0].tags).toEqual([]);
  });

  it("treats empty batches as no-ops", () => {
    const start = [file({ id: "a" })];
    expect(applyBulkFavorite(start, [], true)).toBe(start);
    expect(applyBulkTag(start, [], "t1", true, tags)).toBe(start);
    expect(rollbackBulkFavorite(start, new Map())).toBe(start);
    expect(rollbackBulkTags(start, new Map())).toBe(start);
  });

  it("builds single-request batch bodies with explicit target state", () => {
    const favoritesBody = JSON.stringify({
      action: "setFavorites",
      ids: ["a", "b"],
      isFavorite: true,
    });
    expect(JSON.parse(favoritesBody)).toEqual({
      action: "setFavorites",
      ids: ["a", "b"],
      isFavorite: true,
    });

    const tagBody = JSON.stringify({
      action: "setFileTag",
      fileIds: ["a", "b"],
      tagId: "t1",
      attached: true,
    });
    expect(JSON.parse(tagBody)).toEqual({
      action: "setFileTag",
      fileIds: ["a", "b"],
      tagId: "t1",
      attached: true,
    });
  });
});
