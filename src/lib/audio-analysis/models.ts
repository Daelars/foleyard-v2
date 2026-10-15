import { once } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Writable } from "node:stream";

/**
 * Opt-in model file store (#195, #289). Model weights live outside the
 * database beside it: `%APPDATA%/Foleyard/models` on desktop,
 * `<cwd>/foleyard-models` in web/dev, overridable with
 * `FOLEYARD_MODELS_DIR` (tests point it at temp dirs).
 *
 * Downloads are explicit, counted, cancellable, and resumable:
 *
 * - Every file streams to a `.part` sidecar that is renamed only after
 *   the last byte is flushed, so an interrupted or cancelled download
 *   never promotes a half-written file and completed files are never
 *   touched by a later failure.
 * - A partial survives cancellation. A retry asks for the remainder with
 *   a `Range` request and appends, so an interrupted transfer resumes
 *   instead of restarting; a server that ignores ranges answers `200`
 *   with the whole body and the file is started over, never doubled.
 * - Progress reports the bytes already on disk first, then grows. A
 *   resumed transfer never rewinds the count to zero.
 * - Writes observe backpressure (`write` + `drain`), and the descriptor
 *   is flushed and released on every exit — success, failure, or
 *   cancellation.
 *
 * Single-flight ownership is *not* here: one process owns one download
 * per model through the coordinator on the shared v2 runtime
 * (`src/lib/extensions-v2/model-downloads.ts`).
 */

export type ModelFile = {
  /** Relative path under the model directory, forward slashes. */
  path: string;
  /** Absolute URL the file downloads from. */
  url: string;
};

export type ModelManifest = {
  id: string;
  displayName: string;
  /** Where the files come from, shown on the consent surface. */
  source: string;
  files: ModelFile[];
  /** Shown up front so consent names a size before any byte moves. */
  estimatedBytes: number;
};

export type ModelDownloadCallbacks = {
  onProgress?: (downloadedBytes: number, totalBytes: number) => void;
  /** Polled before each chunk; throw to cancel. */
  throwIfCancelled?: () => void;
};

export type ModelDownloadOptions = {
  root?: string;
  fetchImpl?: typeof fetch;
  /** External cancellation, relayed to the transfer's abort signal. */
  signal?: AbortSignal;
};

export function getModelsDir(): string {
  const override = process.env.FOLEYARD_MODELS_DIR;
  if (override) return override;
  if (process.env.FOLEYARD_DESKTOP === "1" || process.env.SOUNDSLOP_DESKTOP === "1") {
    const appData = process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming");
    return path.join(appData, "Foleyard", "models");
  }
  return path.join(process.cwd(), "foleyard-models");
}

export function modelDirFor(manifest: ModelManifest, root = getModelsDir()): string {
  return path.join(root, manifest.id);
}

export function modelStatus(
  manifest: ModelManifest,
  root = getModelsDir(),
): { ready: boolean; downloadedBytes: number; totalBytes: number } {
  const dir = modelDirFor(manifest, root);
  let downloadedBytes = 0;
  let ready = true;
  for (const file of manifest.files) {
    const full = path.join(dir, file.path);
    if (fs.existsSync(full)) {
      downloadedBytes += fs.statSync(full).size;
    } else {
      ready = false;
    }
  }
  return { ready, downloadedBytes, totalBytes: manifest.estimatedBytes };
}

function fileSize(candidate: string): number {
  try {
    return fs.statSync(candidate).size;
  } catch {
    return 0;
  }
}

/** Total from a `Content-Range` header (`bytes n-m/total` or an unsatisfied `bytes x/total`). */
function parseContentRangeTotal(header: string | null): number | null {
  if (!header) return null;
  const match = /\/\s*(\d+)\s*$/.exec(header);
  return match ? Number(match[1]) : null;
}

/**
 * Write one chunk and, when the writable's buffer is full, wait for
 * `drain` before the caller pulls the next chunk. This is the whole
 * backpressure contract: a slow disk slows the network reader instead of
 * buffering the model in memory.
 */
export async function writeChunkAwaitingDrain(out: Writable, chunk: Buffer): Promise<void> {
  if (out.write(chunk)) return;
  await once(out, "drain");
}

/** Flush and close a write stream, never masking the caller's error. */
async function endWriter(out: fs.WriteStream): Promise<void> {
  if (out.writableEnded || out.destroyed) return;
  await new Promise<void>((resolve) => {
    const finish = (): void => {
      out.removeListener("error", finish);
      out.removeListener("close", finish);
      resolve();
    };
    out.once("error", finish);
    out.once("close", finish);
    out.end(finish);
  });
}

type StreamHooks = {
  onChunk: (length: number) => void;
  throwIfCancelled?: () => void;
};

/**
 * Stream a response body into `sidecar`. On every exit the writer is
 * flushed and closed (Windows keeps an open descriptor locked, and the
 * flushed bytes are what a retry resumes from) and the body reader is
 * cancelled so the network work stops with the transfer.
 */
async function streamToFile(
  response: Response,
  sidecar: string,
  append: boolean,
  hooks: StreamHooks,
): Promise<void> {
  const out = fs.createWriteStream(sidecar, { flags: append ? "a" : "w" });
  const reader = response.body?.getReader();
  let failure: unknown = null;
  try {
    if (!reader) {
      hooks.throwIfCancelled?.();
      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.length > 0) {
        await writeChunkAwaitingDrain(out, buffer);
        hooks.onChunk(buffer.length);
      }
    } else {
      for (;;) {
        hooks.throwIfCancelled?.();
        const { done, value } = await reader.read();
        if (done) break;
        if (value && value.length > 0) {
          await writeChunkAwaitingDrain(out, Buffer.from(value));
          hooks.onChunk(value.length);
        }
      }
    }
  } catch (error) {
    failure = error;
  }
  await endWriter(out);
  if (reader) {
    try {
      await reader.cancel();
    } catch {
      // The stream already settled; there is nothing left to release.
    }
  }
  if (failure) throw failure;
}

/**
 * Fetch every manifest file with progress and cancellation. Returns the
 * bytes fetched from the network this call (0 when everything was
 * already present). Completed files are skipped; a partial is resumed
 * with a range request, and its bytes are reported before any new byte
 * is written.
 */
export async function downloadModel(
  manifest: ModelManifest,
  callbacks: ModelDownloadCallbacks = {},
  options: ModelDownloadOptions = {},
): Promise<{ bytes: number }> {
  const dir = modelDirFor(manifest, options.root ?? getModelsDir());
  const fetchImpl = options.fetchImpl ?? fetch;
  fs.mkdirSync(dir, { recursive: true });

  // Bytes already on disk: completed files plus resumable partials. A
  // resumed transfer reports this baseline first, so the count never
  // restarts from zero.
  let downloaded = 0;
  const partialBytes = new Map<string, number>();
  for (const file of manifest.files) {
    const full = path.join(dir, file.path);
    if (fs.existsSync(full)) {
      downloaded += fileSize(full);
      continue;
    }
    const partial = fileSize(`${full}.part`);
    if (partial > 0) {
      partialBytes.set(file.path, partial);
      downloaded += partial;
    }
  }
  callbacks.onProgress?.(downloaded, manifest.estimatedBytes);

  const controller = new AbortController();
  const relayAbort = (): void => controller.abort();
  options.signal?.addEventListener("abort", relayAbort, { once: true });
  let fetched = 0;
  try {
    for (const file of manifest.files) {
      const full = path.join(dir, file.path);
      if (fs.existsSync(full)) continue;
      fs.mkdirSync(path.dirname(full), { recursive: true });
      const sidecar = `${full}.part`;
      let offset = partialBytes.get(file.path) ?? 0;
      const ranged = offset > 0 ? { headers: { Range: `bytes=${offset}-` } } : {};
      let response = await fetchImpl(file.url, { ...ranged, signal: controller.signal });
      if (response.status === 416 && offset > 0) {
        // The partial already holds all the source has: promote it rather
        // than failing forever. Otherwise the range was stale — restart.
        const total = parseContentRangeTotal(response.headers.get("content-range"));
        if (total !== null && offset >= total) {
          fs.renameSync(sidecar, full);
          continue;
        }
        downloaded -= offset;
        offset = 0;
        response = await fetchImpl(file.url, { signal: controller.signal });
      }
      if (!response.ok) {
        throw new Error(
          `Model file ${file.path} failed to download: HTTP ${response.status}. Check the manifest against the source file list.`,
        );
      }
      // A server that ignores Range answers 200 with the whole body: start
      // this file over rather than appending a second copy behind the partial.
      if (offset > 0 && response.status !== 206) {
        downloaded -= offset;
        offset = 0;
      }
      callbacks.throwIfCancelled?.();
      await streamToFile(response, sidecar, offset > 0, {
        onChunk: (length) => {
          fetched += length;
          downloaded += length;
          callbacks.onProgress?.(downloaded, manifest.estimatedBytes);
        },
        throwIfCancelled: callbacks.throwIfCancelled,
      });
      if (fs.existsSync(full)) {
        // Another owner installed the completed file while this transfer
        // ran. Keep theirs — never overwrite a completed target with a
        // partial we happened to finish — and drop our sidecar.
        fs.rmSync(sidecar, { force: true });
        continue;
      }
      fs.renameSync(sidecar, full);
    }
  } catch (error) {
    // Abort the network work alongside the reader we already cancelled, so
    // a cancelled transfer releases its socket instead of lingering.
    controller.abort();
    throw error;
  } finally {
    options.signal?.removeEventListener("abort", relayAbort);
  }
  return { bytes: fetched };
}
