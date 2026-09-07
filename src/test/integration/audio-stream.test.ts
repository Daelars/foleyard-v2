import fs from "node:fs";
import { getEventListeners } from "node:events";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createScratchLibrary, type ScratchLibrary } from "@/test/fixtures";

const db = vi.hoisted(() => ({ getFileById: vi.fn(), getLibraryRoots: vi.fn() }));
vi.mock("@/lib/db", () => db);
vi.mock("@/lib/extensions/make-pack-recent-store", () => ({ recordRecentMakePackFile: vi.fn() }));
import { GET } from "@/app/api/audio/route";

let library: ScratchLibrary;
beforeEach(() => {
  library = createScratchLibrary("foleyard-stream-");
  const path = library.writeFile("hit.wav", "audio".repeat(500000));
  db.getFileById.mockReturnValue({ id: "hit", path, removedAt: null });
  db.getLibraryRoots.mockReturnValue([library.root]);
});
afterEach(() => {
  vi.restoreAllMocks();
  library.dispose();
});

it.each(["cancel", "abort"])("%s stops buffered audio without writing into a closed response", async (action) => {
  const createReadStream = vi.spyOn(fs, "createReadStream");
  const abort = new AbortController();
  const request = new NextRequest("http://localhost/api/audio?id=hit", {
    headers: { range: "bytes=0-" },
    signal: abort.signal,
  });
  const response = await GET(request);
  expect(response.status).toBe(206);
  const file = createReadStream.mock.results[0].value as fs.ReadStream;
  // Let both the response queue and the file's read-ahead buffer fill.
  // Consuming a chunk then cancelling races with the adapter's queued resume.
  await vi.waitFor(() => {
    expect(file.isPaused()).toBe(true);
    expect(file.readableLength).toBeGreaterThan(0);
  });
  const reader = response.body!.getReader();
  expect((await reader.read()).done).toBe(false);
  const closed = new Promise<void>((resolve) => file.once("close", resolve));
  if (action === "abort") abort.abort();
  else await reader.cancel();
  await closed;
  expect(file.destroyed).toBe(true);
  expect(getEventListeners(request.signal, "abort")).toHaveLength(0);
});

it.each([
  { range: undefined, status: 200, expected: "audio".repeat(500000) },
  { range: "bytes=3-11", status: 206, expected: "ioaudioau" },
  { range: "bytes=-5", status: 206, expected: "audio" },
])("streams the correct bytes for $range", async ({ range, status, expected }) => {
  const request = new NextRequest("http://localhost/api/audio?id=hit", {
    headers: range ? { range } : {},
  });
  const response = await GET(request);
  expect(response.status).toBe(status);
  expect(response.headers.get("content-length")).toBe(String(expected.length));
  expect(await response.text()).toBe(expected);
  expect(getEventListeners(request.signal, "abort")).toHaveLength(0);
});

it("closes a request aborted before the file stream opens", async () => {
  const createReadStream = vi.spyOn(fs, "createReadStream");
  const abort = new AbortController();
  abort.abort();
  const request = new NextRequest("http://localhost/api/audio?id=hit", { signal: abort.signal });
  const response = await GET(request);
  expect(await response.text()).toBe("");
  const file = createReadStream.mock.results[0].value as fs.ReadStream;
  await vi.waitFor(() => expect(file.closed).toBe(true));
  expect(getEventListeners(request.signal, "abort")).toHaveLength(0);
});

it("reports a file read failure through the response and releases the stream", async () => {
  const createReadStream = vi.spyOn(fs, "createReadStream");
  const request = new NextRequest("http://localhost/api/audio?id=hit");
  const response = await GET(request);
  const body = response.arrayBuffer();
  const rejected = expect(body).rejects.toThrow("disk read failed");
  const file = createReadStream.mock.results[0].value as fs.ReadStream;
  file.destroy(new Error("disk read failed"));
  await rejected;
  expect(file.destroyed).toBe(true);
  expect(getEventListeners(request.signal, "abort")).toHaveLength(0);
});
