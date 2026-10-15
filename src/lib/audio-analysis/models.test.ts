import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { Writable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  downloadModel,
  modelDirFor,
  modelStatus,
  writeChunkAwaitingDrain,
  type ModelFile,
  type ModelManifest,
} from "./models";

// Area: opt-in CLAP model store (#195, #289). The model store through a
// local HTTP server: status counts bytes, downloads stream with
// backpressure-aware progress, cancellation aborts the network and the
// stream while keeping a resumable partial, retries resume a partial
// with a range request (or restart when the server ignores ranges), and
// completed files are never corrupted by an interrupted neighbour.

type Hold = { promise: Promise<void>; release: () => void };

function manualHold(): Hold {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

async function waitFor(check: () => boolean, timeoutMs = 2000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!check()) {
    if (Date.now() > deadline) throw new Error("waitFor timed out");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

describe("model store", () => {
  let root = "";
  let server: http.Server | null = null;
  let base = "";
  let bodies = new Map<string, Buffer>();
  let rangeOk = true;
  let hold: Hold | null = null;
  let requests: Array<{ filePath: string; range: string | null }> = [];

  const ONNX = "onnx/model.onnx";

  function makeManifest(
    id: string,
    files: ModelFile[],
    estimatedBytes = 70000,
  ): ModelManifest {
    return { id, displayName: "Test model", source: base, estimatedBytes, files };
  }

  function defaultManifest(id = "test-model"): ModelManifest {
    return makeManifest(
      id,
      [...bodies.keys()].map((filePath) => ({ path: filePath, url: `${base}/${filePath}` })),
    );
  }

  function singleFileManifest(id: string): ModelManifest {
    return makeManifest(id, [{ path: ONNX, url: `${base}/${ONNX}` }], bodies.get(ONNX)!.length);
  }

  function heldPath(manifest: ModelManifest): { full: string; part: string } {
    const dir = modelDirFor(manifest, root);
    const full = path.join(dir, ...ONNX.split("/"));
    return { full, part: `${full}.part` };
  }

  /**
   * Cancel a held single-file download once a chunk landed, leaving a
   * partial behind. The server holds the second half so cancellation is
   * deterministic and the stream is aborted mid-body.
   */
  async function cancelSingleFileMidway(manifest: ModelManifest): Promise<number> {
    hold = manualHold();
    let cancelling = false;
    await expect(
      downloadModel(
        manifest,
        {
          onProgress: (done) => {
            if (done > 0) cancelling = true;
          },
          throwIfCancelled: () => {
            if (cancelling) throw new Error("cancelled");
          },
        },
        { root },
      ),
    ).rejects.toThrow("cancelled");
    hold.release();
    hold = null;
    return fs.statSync(heldPath(manifest).part).size;
  }

  beforeEach(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "foleyard-models-"));
    bodies = new Map<string, Buffer>([
      ["config.json", Buffer.from(JSON.stringify({ model_type: "clap" }))],
      [ONNX, Buffer.alloc(1024 * 64, 7)],
    ]);
    rangeOk = true;
    hold = null;
    requests = [];
    server = http.createServer((request, response) => {
      const filePath = decodeURIComponent((request.url ?? "").slice(1));
      const rangeHeader = typeof request.headers.range === "string" ? request.headers.range : null;
      requests.push({ filePath, range: rangeHeader });
      const body = bodies.get(filePath);
      if (!body) {
        response.writeHead(404);
        response.end();
        return;
      }
      const match = rangeHeader ? /^bytes=(\d+)-$/.exec(rangeHeader) : null;
      if (match) {
        const start = Number(match[1]);
        if (start >= body.length) {
          response.writeHead(416, { "Content-Range": `bytes */${body.length}` });
          response.end();
          return;
        }
        if (rangeOk) {
          response.writeHead(206, {
            "Content-Length": String(body.length - start),
            "Content-Range": `bytes ${start}-${body.length - 1}/${body.length}`,
          });
          response.end(body.subarray(start));
          return;
        }
      }
      response.writeHead(200, {
        "Content-Length": String(body.length),
        "Accept-Ranges": rangeOk ? "bytes" : "none",
        "Content-Type": "application/octet-stream",
      });
      const half = Math.ceil(body.length / 2);
      response.write(body.subarray(0, half));
      const finish = () => {
        try {
          response.end(body.subarray(half));
        } catch {
          // The client aborted; the socket is gone.
        }
      };
      if (hold) void hold.promise.then(finish);
      else setImmediate(finish);
    });
    await new Promise<void>((resolve) => {
      server!.listen(0, "127.0.0.1", () => resolve());
    });
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 0;
    base = `http://127.0.0.1:${port}`;
  });

  afterEach(async () => {
    hold?.release();
    hold = null;
    await new Promise<void>((resolve) => {
      if (!server) return resolve();
      server.closeAllConnections?.();
      server.close(() => resolve());
    });
    server = null;
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("reports status and streams progress through completion", async () => {
    const seen: Array<[number, number]> = [];
    const before = modelStatus(defaultManifest(), root);
    expect(before.ready).toBe(false);
    expect(before.downloadedBytes).toBe(0);

    const { bytes } = await downloadModel(
      defaultManifest(),
      { onProgress: (done, total) => seen.push([done, total]) },
      { root },
    );
    expect(bytes).toBeGreaterThan(0);
    expect(seen.length).toBeGreaterThan(0);
    expect(seen[seen.length - 1]![1]).toBe(70000);

    const after = modelStatus(defaultManifest(), root);
    expect(after.ready).toBe(true);
    expect(after.downloadedBytes).toBe(bytes);
    expect(fs.statSync(heldPath(defaultManifest()).full).size).toBe(1024 * 64);
  });

  it("skips completed files on a second pass", async () => {
    await downloadModel(defaultManifest(), {}, { root });
    const second = await downloadModel(defaultManifest(), {}, { root });
    expect(second.bytes).toBe(0);
  });

  it("fails unknown files naming the file", async () => {
    const bad = makeManifest("bad-model", [{ path: "missing.bin", url: `${base}/missing.bin` }]);
    await expect(downloadModel(bad, {}, { root })).rejects.toThrow("missing.bin");
  });

  it("keeps a cancelled partial for resumption instead of deleting it", async () => {
    const manifest = singleFileManifest("cancel-model");
    const { full, part } = heldPath(manifest);

    const partialBytes = await cancelSingleFileMidway(manifest);

    // The half-written file is never promoted to the completed name…
    expect(fs.existsSync(full)).toBe(false);
    // …but its sidecar survives, so a retry can resume instead of restart.
    expect(partialBytes).toBeGreaterThan(0);
    expect(partialBytes).toBeLessThan(bodies.get(ONNX)!.length);
    expect(fs.existsSync(part)).toBe(true);
  });

  it("resumes a cancelled partial with a range request and counts its bytes", async () => {
    const body = bodies.get(ONNX)!;
    const manifest = singleFileManifest("resume-model");
    const { full } = heldPath(manifest);

    const resumedFrom = await cancelSingleFileMidway(manifest);

    requests = [];
    const progress: number[] = [];
    const { bytes } = await downloadModel(
      manifest,
      { onProgress: (done) => progress.push(done) },
      { root },
    );

    expect(requests.find((entry) => entry.range !== null)?.range).toBe(`bytes=${resumedFrom}-`);
    // Progress carries the bytes already on disk, then grows from there.
    expect(progress[0]).toBe(resumedFrom);
    expect(progress[progress.length - 1]).toBe(body.length);
    expect(bytes).toBe(body.length - resumedFrom);
    expect(fs.readFileSync(full).equals(body)).toBe(true);
  });

  it("restarts a partial when the server ignores range requests", async () => {
    rangeOk = false;
    const body = bodies.get(ONNX)!;
    const manifest = singleFileManifest("no-range-model");
    const { full } = heldPath(manifest);

    await cancelSingleFileMidway(manifest);

    const { bytes } = await downloadModel(manifest, {}, { root });

    // A 200 carrying the whole body restarts the file; it never appends a
    // second copy behind the partial.
    expect(bytes).toBe(body.length);
    expect(fs.statSync(full).size).toBe(body.length);
    expect(fs.readFileSync(full).equals(body)).toBe(true);
  });

  it("completes a partial that already holds the whole file", async () => {
    const body = bodies.get(ONNX)!;
    const manifest = singleFileManifest("full-partial-model");
    const { full, part } = heldPath(manifest);
    fs.mkdirSync(path.dirname(part), { recursive: true });
    fs.writeFileSync(part, body);

    const { bytes } = await downloadModel(manifest, {}, { root });

    expect(bytes).toBe(0);
    expect(fs.readFileSync(full).equals(body)).toBe(true);
    expect(fs.existsSync(part)).toBe(false);
  });

  it("never overwrites a completed file that appeared while the transfer ran", async () => {
    const manifest = singleFileManifest("race-model");
    const { full } = heldPath(manifest);
    hold = manualHold();
    const pending = downloadModel(manifest, {}, { root });
    await waitFor(() => fs.existsSync(`${full}.part`));

    // Another owner installed the completed file first; our transfer must
    // not clobber it.
    const precious = Buffer.from("installed by another owner");
    fs.writeFileSync(full, precious);
    hold.release();
    hold = null;
    await pending;

    expect(fs.readFileSync(full).equals(precious)).toBe(true);
    expect(fs.existsSync(`${full}.part`)).toBe(false);
  });

  it("keeps completed files when a later file fails", async () => {
    const info = { path: "config.json", url: `${base}/config.json` };
    const later = { path: "onnx/later.onnx", url: `${base}/onnx/later.onnx` };
    const first = makeManifest("flaky-model", [info, later]);

    await expect(downloadModel(first, {}, { root })).rejects.toThrow("onnx/later.onnx");
    const infoPath = path.join(modelDirFor(first, root), "config.json");
    expect(fs.readFileSync(infoPath).equals(bodies.get("config.json")!)).toBe(true);

    bodies.set("onnx/later.onnx", Buffer.alloc(2048, 3));
    const second = makeManifest("flaky-model", [info, later]);
    await downloadModel(second, {}, { root });
    expect(modelStatus(second, root).ready).toBe(true);
    expect(fs.readFileSync(infoPath).equals(bodies.get("config.json")!)).toBe(true);
  });

  it("releases the partial file handle on cancellation", async () => {
    const manifest = singleFileManifest("release-model");
    const { part } = heldPath(manifest);

    await cancelSingleFileMidway(manifest);

    // Windows keeps an open descriptor locked (EBUSY); removing the
    // sidecar proves every exit path released it.
    expect(() => fs.rmSync(part, { force: true })).not.toThrow();
    expect(fs.existsSync(part)).toBe(false);
  });

  it("aborts the response stream and the fetch when cancelled", async () => {
    let streamCancelled = false;
    let fetchAborted = false;
    const fetchImpl: typeof fetch = (_input, init) => {
      init?.signal?.addEventListener("abort", () => {
        fetchAborted = true;
      });
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array(4096));
        },
        cancel() {
          streamCancelled = true;
        },
      });
      return Promise.resolve(new Response(body, { status: 200 }));
    };
    const manifest = makeManifest("abort-model", [{ path: ONNX, url: "http://example.invalid/x" }], 4096);
    let cancelling = false;

    await expect(
      downloadModel(
        manifest,
        {
          onProgress: (done) => {
            if (done > 0) cancelling = true;
          },
          throwIfCancelled: () => {
            if (cancelling) throw new Error("cancelled");
          },
        },
        { root, fetchImpl },
      ),
    ).rejects.toThrow("cancelled");

    expect(streamCancelled).toBe(true);
    expect(fetchAborted).toBe(true);
    expect(fs.existsSync(heldPath(manifest).full)).toBe(false);
  });

  it("relays an external abort signal to the network request", async () => {
    const controller = new AbortController();
    let fetchAborted = false;
    const fetchImpl: typeof fetch = (_input, init) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          fetchAborted = true;
          reject(new Error("aborted"));
        });
      });
    const manifest = makeManifest("external-abort", [{ path: ONNX, url: "http://example.invalid/x" }]);

    const pending = downloadModel(manifest, {}, { root, fetchImpl, signal: controller.signal });
    controller.abort();

    await expect(pending).rejects.toThrow("aborted");
    expect(fetchAborted).toBe(true);
    expect(fs.existsSync(heldPath(manifest).full)).toBe(false);
  });
});

describe("model store backpressure", () => {
  it("waits for a writable to drain before writing the next chunk", async () => {
    const pending: Array<() => void> = [];
    const accepted: number[] = [];
    const out = new Writable({
      highWaterMark: 4,
      write(chunk: Buffer, _encoding, callback) {
        accepted.push(chunk.length);
        pending.push(() => callback());
      },
    });
    let resolved = false;
    const writing = writeChunkAwaitingDrain(out, Buffer.alloc(16)).then(() => {
      resolved = true;
    });

    await new Promise((resolve) => setImmediate(resolve));
    expect(resolved).toBe(false);
    expect(pending).toHaveLength(1);

    pending.shift()?.();
    await writing;
    expect(resolved).toBe(true);
    expect(accepted).toEqual([16]);
  });
});
