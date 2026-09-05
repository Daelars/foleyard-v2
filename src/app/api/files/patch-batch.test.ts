import Database from "better-sqlite3";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { initializeDatabaseSchema } from "@/lib/database/migrations";
import { SqliteAudioFileRepository } from "@/lib/database/file-repository";
import { SqliteTagRepository } from "@/lib/database/tag-repository";

const state = vi.hoisted(() => ({
  sqlite: null as Database.Database | null,
  files: null as SqliteAudioFileRepository | null,
  tags: null as SqliteTagRepository | null,
  txnCount: 0,
}));

vi.mock("@/lib/db", () => ({
  getFileById: (id: string) => state.files!.getFileById(id),
  getAllTags: () => state.tags!.getAllTags(),
  getAllCollections: () => [],
  getFiles: (...args: never[]) => (state.files as never as { getFiles: (...a: never[]) => unknown }).getFiles(...args),
  getFileCount: (...args: never[]) =>
    (state.files as never as { getFileCount: (...a: never[]) => unknown }).getFileCount(...args),
  getTagsForFiles: (ids: string[]) => state.tags!.getTagsForFiles(ids),
  toggleFavorite: (id: string) => state.files!.toggleFavorite(id),
  attachTagToFile: (fileId: string, tagId: string) => state.tags!.attachTagToFile(fileId, tagId),
  detachTagFromFile: (fileId: string, tagId: string) =>
    state.tags!.detachTagFromFile(fileId, tagId),
  setFavorites: (ids: string[], isFavorite: boolean) =>
    state.files!.setFavorites(ids, isFavorite),
  setFileTagBatch: (fileIds: string[], tagId: string, attached: boolean) =>
    state.files!.setFileTagBatch(fileIds, tagId, attached),
}));

import { PATCH } from "./route";

function scanRecord(index: number) {
  return {
    path: `/music/route-${index}.mp3`,
    filename: `route-${index}.mp3`,
    directory: "/music",
    format: ".mp3",
    codec: null,
    duration: null,
    sampleRate: null,
    bitDepth: null,
    channels: null,
    fileSize: null,
    mtimeMs: 0,
    removedAt: null,
    lastScannedAt: "",
  };
}

const request = (body: unknown) =>
  new NextRequest("http://localhost/api/files", {
    method: "PATCH",
    body: JSON.stringify(body),
  });

beforeEach(() => {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  initializeDatabaseSchema(sqlite);
  state.sqlite = sqlite;
  state.files = new SqliteAudioFileRepository(sqlite);
  state.tags = new SqliteTagRepository(sqlite);
  state.txnCount = 0;
  const original = sqlite.transaction.bind(sqlite);
  vi.spyOn(sqlite, "transaction").mockImplementation(((fn: (...args: never[]) => unknown) => {
    state.txnCount += 1;
    return original(fn as never);
  }) as never);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  state.sqlite?.close();
  vi.restoreAllMocks();
});

describe("files PATCH batch actions", () => {
  it("completes a 500-file bulk tag as one request and one transaction", async () => {
    const total = 500;
    state.files!.batchUpsertFiles(
      Array.from({ length: total }, (_, index) => scanRecord(index)),
      new Date().toISOString(),
    );
    const tagId = state.tags!.createTag("bulk");
    const ids = state.files!.getFiles({ limit: total + 10 }).map((file) => file.id);
    state.txnCount = 0;

    const response = await PATCH(
      request({ action: "setFileTag", fileIds: ids, tagId, attached: true }),
    );

    expect(response.status).toBe(200);
    expect(state.txnCount).toBe(1);
    expect(state.tags!.getTagsForFiles(ids).size).toBe(total);
  });

  it("rolls back a bulk tag when one file id is unknown", async () => {
    state.files!.batchUpsertFiles([scanRecord(1), scanRecord(2)], new Date().toISOString());
    const tagId = state.tags!.createTag("bulk");
    const ids = state.files!.getFiles({ limit: 10 }).map((file) => file.id);

    const response = await PATCH(
      request({ action: "setFileTag", fileIds: [...ids, "missing-id"], tagId, attached: true }),
    );

    expect(response.status).toBe(404);
    expect(state.tags!.getTagsForFiles(ids).size).toBe(0);
  });

  it("sets favourites with an explicit target and returns the total", async () => {
    state.files!.batchUpsertFiles([scanRecord(1), scanRecord(2)], new Date().toISOString());
    const ids = state.files!.getFiles({ limit: 10 }).map((file) => file.id);
    state.txnCount = 0;

    const favourite = await PATCH(request({ action: "setFavorites", ids, isFavorite: true }));
    expect(favourite.status).toBe(200);
    expect(await favourite.json()).toEqual({ success: true, favoritesTotal: 2 });
    expect(state.txnCount).toBe(1);

    const unfavourite = await PATCH(
      request({ action: "setFavorites", ids: [ids[0]], isFavorite: false }),
    );
    expect(await unfavourite.json()).toEqual({ success: true, favoritesTotal: 1 });
  });

  it("rolls back favourites when one file id is unknown", async () => {
    state.files!.batchUpsertFiles([scanRecord(1)], new Date().toISOString());
    const ids = state.files!.getFiles({ limit: 10 }).map((file) => file.id);

    const response = await PATCH(
      request({ action: "setFavorites", ids: [...ids, "missing-id"], isFavorite: true }),
    );

    expect(response.status).toBe(404);
    expect(state.files!.getFileCount({ favorites: true })).toBe(0);
  });

  it("rejects single-file actions without an id instead of throwing", async () => {
    state.files!.batchUpsertFiles([scanRecord(1)], new Date().toISOString());
    const tagId = state.tags!.createTag("single");
    const [file] = state.files!.getFiles({ limit: 10 });

    expect((await PATCH(request({ action: "toggleFavorite" }))).status).toBe(400);
    expect(
      (await PATCH(request({ action: "toggleFavorite", isFavorite: true }))).status,
    ).toBe(400);
    expect((await PATCH(request({ action: "attachTag", tagId }))).status).toBe(400);
    expect((await PATCH(request({ action: "detachTag", tagId }))).status).toBe(400);
    expect((await PATCH(request({ action: "attachTag", id: file.id }))).status).toBe(400);
    expect((await PATCH(request({ action: "detachTag", id: file.id }))).status).toBe(400);

    expect((await PATCH(request({ action: "toggleFavorite", id: file.id }))).status).toBe(200);
    expect(
      (await PATCH(request({ action: "attachTag", id: file.id, tagId }))).status,
    ).toBe(200);
    expect(
      (await PATCH(request({ action: "detachTag", id: file.id, tagId }))).status,
    ).toBe(200);
  });

  it("validates batch payloads", async () => {
    expect((await PATCH(request({ action: "setFavorites", ids: ["a"] }))).status).toBe(400);
    expect(
      (await PATCH(request({ action: "setFavorites", ids: ["a"], isFavorite: "yes" }))).status,
    ).toBe(400);
    expect(
      (await PATCH(request({ action: "setFileTag", fileIds: [], tagId: "", attached: true })))
        .status,
    ).toBe(400);
  });
});
