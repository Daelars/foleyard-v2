import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import { getDatabasePath } from "./database-path";
import { generateWaveform, WAVEFORM_PEAK_COUNT, type WaveformPeaks } from "./waveform-generator";

const pending = new Map<string, Promise<WaveformPeaks>>();
let running = 0;
const waiting: Array<() => void> = [];
/** Semaphore-bounded slot (max 2 concurrent generations). Exported for unit testing. */
export async function withGenerationSlot<T>(work: () => Promise<T>): Promise<T> {
  if (running >= 2) {
    await new Promise<void>((resolve) => waiting.push(resolve));
    running++;
  } else {
    running++;
  }
  try { return await work(); }
  finally {
    running--;
    const next = waiting.shift();
    if (next) next();
  }
}

/** One persistent entry per canonical path; identity includes size and modification time. */
export async function getWaveformPeaks(filePath: string, cacheDirectory = path.join(path.dirname(getDatabasePath()), ".waveform-cache")): Promise<WaveformPeaks> {
  const source = await stat(filePath);
  const identity = `2:${source.mtimeMs}:${source.size}`;
  const key = createHash("sha256").update(filePath).digest("hex");
  const cachePath = path.join(cacheDirectory, `${key}.json`);
  const taskKey = `${cachePath}:${identity}`;
  const existing = pending.get(taskKey);
  if (existing) return existing;
  const task = withGenerationSlot(async () => {
    try {
      const cached = JSON.parse(await readFile(cachePath, "utf8"));
      if (cached.identity === identity && typeof cached.supported === "boolean" &&
          Array.isArray(cached.peaks) && cached.peaks.length === WAVEFORM_PEAK_COUNT &&
          cached.peaks.every((peak: unknown) => typeof peak === "number" && Number.isFinite(peak) && peak >= 0 && peak <= 1)) {
        return { peaks: cached.peaks as number[], supported: cached.supported as boolean };
      }
    } catch { /* Missing or corrupt cache entries are recomputed. */ }
    const result = await generateWaveform(filePath);
    const after = await stat(filePath);
    if (after.size !== source.size || after.mtimeMs !== source.mtimeMs) {
      throw new Error("Audio file changed during waveform generation");
    }
    const temporaryPath = `${cachePath}.${randomUUID()}.tmp`;
    try {
      await mkdir(cacheDirectory, { recursive: true });
      await writeFile(temporaryPath, JSON.stringify({ identity, ...result }));
      await rename(temporaryPath, cachePath);
    } catch (error) {
      console.warn("Waveform cache could not be persisted:", error);
    } finally {
      await unlink(temporaryPath).catch(() => {});
    }
    return result;
  });
  pending.set(taskKey, task);
  try { return await task; }
  finally { pending.delete(taskKey); }
}
