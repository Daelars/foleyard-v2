import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  audioFileRecord,
  callRoute,
  createTestDatabase,
  type TestDatabase,
} from "@/test/fixtures";
import { SqliteAudioFileRepository } from "@/lib/database/file-repository";
import { SqliteTagRepository } from "@/lib/database/tag-repository";

const state = vi.hoisted(() => ({
  files: null as SqliteAudioFileRepository | null,
  tags: null as SqliteTagRepository | null,
}));

vi.mock("@/lib/db", () => ({
  getFiles: (options?: Record<string, unknown>) => state.files!.getFiles(options),
  getFileCount: (options?: Record<string, unknown>) => state.files!.getFileCount(options),
  getTagsForFiles: (ids: string[]) => state.tags!.getTagsForFiles(ids),
  getAttachmentsForFiles: (ids: string[]) => state.tags!.getAttachmentsForFiles(ids),
  attachTagToFile: (fileId: string, tagId: string) =>
    state.tags!.attachTagToFile(fileId, tagId),
  detachTagFromFile: (fileId: string, tagId: string) =>
    state.tags!.detachTagFromFile(fileId, tagId),
  setFavorites: (ids: string[], value: boolean) => state.files!.setFavorites(ids, value),
  setFileTagBatch: (ids: string[], tagId: string, attached: boolean) =>
    state.files!.setFileTagBatch(ids, tagId, attached),
  toggleFavorite: (id: string) => state.files!.toggleFavorite(id),
}));

import { GET as getFilesRoute } from "@/app/api/files/route";

// Area: provenance UI (#193). The files route merges attachment origins
// onto tags and filters by origin: deterministic files surface with
// their provenance, unknown origins reject with a reason.
describe("files route tag origins", () => {
  let sqlite: TestDatabase;
  let files: SqliteAudioFileRepository;
  let tags: SqliteTagRepository;
  let thunderFile = "";
  let rainFile = "";

  beforeEach(() => {
    sqlite = createTestDatabase();
    files = new SqliteAudioFileRepository(sqlite);
    tags = new SqliteTagRepository(sqlite);
    state.files = files;
    state.tags = tags;
    vi.spyOn(console, "error").mockImplementation(() => {});

    files.batchUpsertFiles(
      [
        audioFileRecord({ path: "/lib/thunder.wav", filename: "thunder.wav" }),
        audioFileRecord({ path: "/lib/rain.wav", filename: "rain.wav" }),
      ],
      new Date().toISOString(),
    );
    const rows = files.getFiles({ limit: 10 });
    thunderFile = rows.find((row) => row.filename === "thunder.wav")!.id;
    rainFile = rows.find((row) => row.filename === "rain.wav")!.id;
    const thunder = tags.createTag("thunder");
    const weather = tags.createTag("weather");
    tags.attachTagToFileWithOrigin(thunderFile, thunder, "deterministic");
    tags.attachTagToFileWithOrigin(thunderFile, weather, "semantic_ai", 0.83);
    tags.attachTagToFile(rainFile, weather);
  });

  afterEach(() => {
    sqlite.close();
    vi.restoreAllMocks();
  });

  it("merges origin and confidence onto each tag", async () => {
    const { status, body } = await callRoute<{ files: Array<{ id: string; tags: unknown[] }> }>(
      getFilesRoute,
      { method: "GET", url: "http://localhost/api/files?limit=10" },
    );
    expect(status).toBe(200);
    const thunder = body.files.find((file) => file.id === thunderFile)!;
    expect(thunder.tags).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "thunder", origin: "deterministic" }),
        expect.objectContaining({ name: "weather", origin: "semantic_ai", confidence: 0.83 }),
      ]),
    );
    const rain = body.files.find((file) => file.id === rainFile)!;
    expect(rain.tags).toEqual([
      expect.objectContaining({ name: "weather", origin: "manual" }),
    ]);
  });

  it("filters files by attachment origin", async () => {
    const deterministic = await callRoute<{ files: Array<{ id: string }> }>(getFilesRoute, {
      method: "GET",
      url: "http://localhost/api/files?origin=deterministic&limit=10",
    });
    expect(deterministic.status).toBe(200);
    expect(deterministic.body.files.map((file) => file.id)).toEqual([thunderFile]);

    const manual = await callRoute<{ files: Array<{ id: string }> }>(getFilesRoute, {
      method: "GET",
      url: "http://localhost/api/files?origin=manual&limit=10",
    });
    expect(manual.body.files.map((file) => file.id)).toEqual([rainFile]);
  });

  it("rejects unknown origins with a reason", async () => {
    const { status } = await callRoute(getFilesRoute, {
      method: "GET",
      url: "http://localhost/api/files?origin=whatever&limit=10",
    });
    expect(status).toBe(400);
  });
});
