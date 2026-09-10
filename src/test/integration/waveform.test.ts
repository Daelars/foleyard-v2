import { execFileSync } from "node:child_process";
import * as childProcess from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import ffmpeg from "ffmpeg-static";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createScratchLibrary, type ScratchLibrary } from "@/test/fixtures";
import { generateWaveform, WAVEFORM_PEAK_COUNT } from "@/lib/waveform-generator";
import { getWaveformPeaks, withGenerationSlot } from "@/lib/waveform-cache";
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

it("serves a valid cache hit while both generation slots are held", async () => {
  const file = encode("wav");
  const cache = library.directory("cache");
  await getWaveformPeaks(file, cache);

  let releaseA: () => void = () => {};
  let releaseB: () => void = () => {};
  const holdA = withGenerationSlot(() => new Promise<void>((resolve) => { releaseA = resolve; }));
  const holdB = withGenerationSlot(() => new Promise<void>((resolve) => { releaseB = resolve; }));
  await new Promise((resolve) => setTimeout(resolve, 0));

  const hit = await Promise.race([
    getWaveformPeaks(file, cache).then(() => "hit"),
    new Promise<string>((resolve) => setTimeout(() => resolve("blocked"), 300)),
  ]);
  releaseA();
  releaseB();
  await Promise.all([holdA, holdB]);

  expect(hit).toBe("hit");
});

it("keeps corrupt audio neutral rather than inventing peaks", async () => {
  const result = await generateWaveform(library.writeFile("broken.mp3", "not audio"));
  expect(result.supported).toBe(false);
  expect(result.peaks).toEqual(Array(WAVEFORM_PEAK_COUNT).fill(0));
});

// Reference reduction: the pre-specialization PCM16 loop, kept in the test
// so the specialized path is pinned against the behavior it replaced.
function referencePcm16Peaks(samples: Int16Array, channels: number, frames: number) {
  const peaks = Array<number>(WAVEFORM_PEAK_COUNT).fill(0);
  const counts = Array<number>(WAVEFORM_PEAK_COUNT).fill(0);
  let offset = 0;
  for (let frame = 0; frame < frames; frame++) {
    const bin = Math.min(WAVEFORM_PEAK_COUNT - 1, Math.floor(frame * WAVEFORM_PEAK_COUNT / frames));
    for (let channel = 0; channel < channels; channel++) {
      peaks[bin] += Math.min(1, Math.abs(samples[offset++]! / 32768));
      counts[bin]++;
    }
  }
  for (let i = 0; i < peaks.length; i++) peaks[i] = counts[i] ? peaks[i]! / counts[i]! : 0;
  const maximum = Math.max(...peaks, 0.001);
  return peaks.map((peak) => peak / maximum);
}

function writePcm16Wav(samples: Int16Array, channels: number) {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + samples.length * 2, 4);
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(16000, 24);
  header.writeUInt32LE(16000 * 2 * channels, 28);
  header.writeUInt16LE(2 * channels, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(samples.length * 2, 40);
  const body = Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength);
  return Buffer.concat([header, body]);
}

it.each([
  ["stereo full scale", 2, (frame: number, channel: number) => (channel === 0 ? 32767 : -32768)],
  ["mono silent", 1, () => 0],
  ["mono odd frames", 1, (frame: number) => (frame % 37 === 0 ? 20000 : 0)],
  ["stereo opposite phase", 2, (frame: number, channel: number) => (frame % 2 === 0 ? 16000 : -16000) * (channel === 0 ? 1 : -1)],
  ["six channels mixed", 6, (frame: number, channel: number) => Math.trunc(3000 * Math.sin(frame / 17 + channel))],
])("PCM16 specialized reduction matches the generic loop for %s", async (_name, channels, generator) => {
  const frames = 1000 + (channels === 6 ? 13 : 0);
  const samples = new Int16Array(frames * channels);
  for (let frame = 0; frame < frames; frame++) {
    for (let channel = 0; channel < channels; channel++) {
      samples[frame * channels + channel] = generator(frame, channel);
    }
  }
  const filePath = path.join(library.root, `parity-${channels}ch.wav`);
  fs.writeFileSync(filePath, writePcm16Wav(samples, channels));
  const expected = referencePcm16Peaks(samples, channels, frames);
  const result = await generateWaveform(filePath);
  expect(result.supported).toBe(true);
  expect(result.peaks).toEqual(expected);
});
