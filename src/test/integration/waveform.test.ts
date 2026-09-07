import { execFileSync } from "node:child_process";
import * as childProcess from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import ffmpeg from "ffmpeg-static";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createScratchLibrary, type ScratchLibrary } from "@/test/fixtures";
import { generateWaveform, WAVEFORM_PEAK_COUNT } from "@/lib/waveform-generator";
import { getWaveformPeaks } from "@/lib/waveform-cache";
vi.mock("node:child_process", { spy: true });

let library: ScratchLibrary;
beforeEach(() => { library = createScratchLibrary("foleyard-waveform-"); });
afterEach(() => { vi.restoreAllMocks(); library.dispose(); });

function encode(extension: string) {
  const target = path.join(library.root, `quiet-then-loud.${extension}`);
  // Opposite stereo phases also catch accidental cancellation from mono mixing.
  const sample = "sin(2*PI*440*t)*(0.02+0.7*gte(t\\,0.5))";
  execFileSync(ffmpeg!, [
    "-v", "error", "-f", "lavfi", "-i",
    `aevalsrc=${sample}|-(${sample}):s=16000:d=1`, "-y", target,
  ], { windowsHide: true });
  return target;
}

it.each(["mp3", "flac", "ogg", "m4a", "aiff", "wav"])("forms a real quiet-to-loud waveform for %s", async (extension) => {
  const result = await generateWaveform(encode(extension));
  expect(result.supported).toBe(true);
  expect(result.peaks).toHaveLength(WAVEFORM_PEAK_COUNT);
  expect(result.peaks.every((peak) => Number.isFinite(peak) && peak >= 0 && peak <= 1)).toBe(true);
  const average = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;
  expect(average(result.peaks.slice(0, 200))).toBeLessThan(0.15);
  expect(average(result.peaks.slice(300))).toBeGreaterThan(0.6);
});

it("replaces old flat MP3 caches and shares persisted peaks across callers and reloads", async () => {
  const file = encode("mp3");
  const cache = library.directory("cache");
  const stat = fs.statSync(file);
  const cachePath = path.join(cache, `${createHash("sha256").update(file).digest("hex")}.json`);
  fs.writeFileSync(cachePath, JSON.stringify({
    identity: `1:${stat.mtimeMs}:${stat.size}`,
    supported: false, peaks: Array(WAVEFORM_PEAK_COUNT).fill(0),
  }));
  const spawn = vi.mocked(childProcess.spawn);
  spawn.mockClear();
  const [row, player] = await Promise.all([getWaveformPeaks(file, cache), getWaveformPeaks(file, cache)]);
  expect(row.supported).toBe(true);
  expect(Math.max(...row.peaks)).toBeGreaterThan(0.9);
  expect(player).toEqual(row);
  expect(spawn).toHaveBeenCalledTimes(1);
  vi.resetModules();
  const freshCache = await import("@/lib/waveform-cache");
  expect(await freshCache.getWaveformPeaks(file, cache)).toEqual(row);
  expect(spawn).toHaveBeenCalledTimes(1);
});

it("keeps corrupt audio neutral rather than inventing peaks", async () => {
  const result = await generateWaveform(library.writeFile("broken.mp3", "not audio"));
  expect(result.supported).toBe(false);
  expect(result.peaks).toEqual(Array(WAVEFORM_PEAK_COUNT).fill(0));
});
