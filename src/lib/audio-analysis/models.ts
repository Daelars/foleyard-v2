import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Opt-in model file store (#195). Model weights live outside the
 * database beside it: `%APPDATA%/Foleyard/models` on desktop,
 * `<cwd>/foleyard-models` in web/dev, overridable with
 * `FOLEYARD_MODELS_DIR` (tests point it at temp dirs).
 *
 * Downloads are explicit, counted, and cancellable: every file streams
 * to a `.part` sidecar that is renamed only on success, so an
 * interrupted or cancelled download never poisons the store and a
 * first run offline simply finds nothing downloaded.
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
  /** Polled per chunk; throw to cancel. */
  throwIfCancelled?: () => void;
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

/**
 * Fetch every manifest file with progress and cancellation. Returns
 * the bytes written. A failed or cancelled download removes its
 * sidecars; completed files are skipped, so retrying resumes at file
 * granularity.
 */
export async function downloadModel(
  manifest: ModelManifest,
  callbacks: ModelDownloadCallbacks = {},
  options: { root?: string; fetchImpl?: typeof fetch } = {},
): Promise<{ bytes: number }> {
  const dir = modelDirFor(manifest, options.root ?? getModelsDir());
  const fetchImpl = options.fetchImpl ?? fetch;
  fs.mkdirSync(dir, { recursive: true });
  let written = 0;
  for (const file of manifest.files) {
    const full = path.join(dir, file.path);
    if (fs.existsSync(full)) continue;
    fs.mkdirSync(path.dirname(full), { recursive: true });
    const sidecar = `${full}.part`;
    try {
      const response = await fetchImpl(file.url);
      if (!response.ok) {
        throw new Error(
          `Model file ${file.path} failed to download: HTTP ${response.status}. Check the manifest against the source file list.`,
        );
      }
      const out = fs.createWriteStream(sidecar);
      try {
        const reader = response.body?.getReader();
        if (!reader) {
          const buffer = Buffer.from(await response.arrayBuffer());
          out.write(buffer);
          written += buffer.length;
        } else {
          for (;;) {
            callbacks.throwIfCancelled?.();
            const { done, value } = await reader.read();
            if (done) break;
            if (value) {
              out.write(Buffer.from(value));
              written += value.length;
              callbacks.onProgress?.(written, manifest.estimatedBytes);
            }
          }
        }
      } finally {
        await new Promise<void>((resolve, reject) => {
          out.end((error?: Error | null) => (error ? reject(error) : resolve()));
        });
      }
      fs.renameSync(sidecar, full);
    } catch (error) {
      try {
        if (fs.existsSync(sidecar)) fs.rmSync(sidecar);
      } catch {
        // Cleanup is best-effort; the original error is what matters.
      }
      throw error;
    }
  }
  return { bytes: written };
}
