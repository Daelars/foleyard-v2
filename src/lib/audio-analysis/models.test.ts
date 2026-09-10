import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  downloadModel,
  modelDirFor,
  modelStatus,
  type ModelManifest,
} from "./models";

// Area: opt-in CLAP (#195). The model store through a local HTTP
// server: status counts bytes, downloads stream with progress,
// cancellation cleans its sidecars, completed files skip, and unknown
// files fail naming the file.
describe("model store", () => {
  let root = "";
  let server: http.Server | null = null;
  let base = "";
  const bodies = new Map<string, Buffer>([
    ["config.json", Buffer.from(JSON.stringify({ model_type: "clap" }))],
    ["onnx/model.onnx", Buffer.alloc(1024 * 64, 7)],
  ]);

  function manifest(): ModelManifest {
    return {
      id: "test-model",
      displayName: "Test model",
      source: base,
      estimatedBytes: 70000,
      files: [...bodies.keys()].map((filePath) => ({
        path: filePath,
        url: `${base}/${filePath}`,
      })),
    };
  }

  beforeEach(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "foleyard-models-"));
    server = http.createServer((request, response) => {
      const body = bodies.get(request.url?.slice(1) ?? "");
      if (!body) {
        response.writeHead(404);
        response.end();
        return;
      }
      response.writeHead(200, {
        "Content-Length": body.length,
        "Content-Type": "application/octet-stream",
      });
      const half = Math.ceil(body.length / 2);
      response.write(body.subarray(0, half));
      setImmediate(() => {
        response.end(body.subarray(half));
      });
    });
    await new Promise<void>((resolve) => {
      server!.listen(0, "127.0.0.1", () => resolve());
    });
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 0;
    base = `http://127.0.0.1:${port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => {
      if (server) server.close(() => resolve());
      else resolve();
    });
    server = null;
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("reports status and downloads with progress", async () => {
    const seen: Array<[number, number]> = [];
    const before = modelStatus(manifest(), root);
    expect(before.ready).toBe(false);
    expect(before.downloadedBytes).toBe(0);

    const { bytes } = await downloadModel(
      manifest(),
      { onProgress: (done, total) => seen.push([done, total]) },
      { root },
    );
    expect(bytes).toBeGreaterThan(0);
    expect(seen.length).toBeGreaterThan(0);
    expect(seen[seen.length - 1]![1]).toBe(70000);

    const after = modelStatus(manifest(), root);
    expect(after.ready).toBe(true);
    expect(after.downloadedBytes).toBe(bytes);
    expect(
      fs.readFileSync(path.join(modelDirFor(manifest(), root), "onnx/model.onnx")).length,
    ).toBe(1024 * 64);
  });

  it("skips completed files and cleans sidecars on cancel", async () => {
    await downloadModel(manifest(), {}, { root });
    const second = await downloadModel(manifest(), {}, { root });
    expect(second.bytes).toBe(0);

    const partial = manifest();
    partial.id = "cancel-model";
    partial.files = [{ path: "onnx/model.onnx", url: `${base}/onnx/model.onnx` }];
    let calls = 0;
    await expect(
      downloadModel(
        partial,
        {
          throwIfCancelled: () => {
            calls += 1;
            if (calls > 1) throw new Error("cancelled");
          },
        },
        { root },
      ),
    ).rejects.toThrow("cancelled");
    expect(fs.existsSync(path.join(modelDirFor(partial, root), "onnx/model.onnx"))).toBe(false);
    expect(fs.existsSync(path.join(modelDirFor(partial, root), "onnx/model.onnx.part"))).toBe(
      false,
    );
  });

  it("fails unknown files naming the file", async () => {
    const bad = manifest();
    bad.id = "bad-model";
    bad.files = [{ path: "missing.bin", url: `${base}/missing.bin` }];
    await expect(downloadModel(bad, {}, { root })).rejects.toThrow("missing.bin");
  });
});
