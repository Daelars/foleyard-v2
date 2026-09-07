import { spawn } from "node:child_process";
import ffmpegPath from "ffmpeg-static";

/** Decode compressed audio once, retaining only bounded amplitude summaries. */
export async function decodeWaveform(filePath: string, peakCount: number): Promise<number[] | null> {
  if (!ffmpegPath) throw new Error("Waveform decoder is unavailable on this platform");
  const executable = ffmpegPath.replace(/app\.asar([\\/])/, "app.asar.unpacked$1");
  const decoder = spawn(executable, [
    "-hide_banner", "-loglevel", "error", "-nostdin",
    "-protocol_whitelist", "file,pipe", "-threads", "1", "-i", filePath,
    "-map", "0:a:0", "-vn", "-sn", "-dn",
    "-threads", "1", "-f", "f32le", "-acodec", "pcm_f32le", "pipe:1",
  ], { windowsHide: true, stdio: ["ignore", "pipe", "ignore"] });
  const exited = new Promise<{ code: number | null; error?: Error }>((resolve) => {
    decoder.once("error", (error) => resolve({ code: null, error }));
    decoder.once("close", (code) => resolve({ code }));
  });
  let timedOut = false;
  const timeout = setTimeout(() => { timedOut = true; decoder.kill(); }, 120_000);
  timeout.unref();
  let bins: Array<{ sum: number; count: number }> = [];
  let blockSize = 128;
  let sum = 0;
  let count = 0;
  let total = 0;
  let remainder = Buffer.alloc(0);
  try {
    for await (const chunk of decoder.stdout) {
      const bytes = Buffer.concat([remainder, chunk]);
      const end = bytes.length - bytes.length % 4;
      for (let offset = 0; offset < end; offset += 4) {
        const sample = bytes.readFloatLE(offset);
        sum += Number.isFinite(sample) ? Math.min(1, Math.abs(sample)) : 0;
        count++;
        total++;
        if (count === blockSize) {
          bins.push({ sum, count });
          sum = 0;
          count = 0;
          // Coarsen adjacent summaries as duration grows. All channels count;
          // mixing to mono would erase audio with opposite stereo phases.
          if (bins.length === peakCount * 2) {
            bins = Array.from({ length: peakCount }, (_, i) => ({
              sum: bins[i * 2].sum + bins[i * 2 + 1].sum,
              count: bins[i * 2].count + bins[i * 2 + 1].count,
            }));
            blockSize *= 2;
          }
        }
      }
      remainder = Buffer.from(bytes.subarray(end));
    }
    const result = await exited;
    if (result.error) throw result.error;
    if (timedOut) throw new Error("Waveform decoding timed out");
    if (result.code !== 0 || remainder.length) return null;
    if (count) bins.push({ sum, count });
    if (!total) return Array<number>(peakCount).fill(0);
    const peaks = Array.from({ length: peakCount }, (_, index) => {
      const start = index * total / peakCount;
      const end = (index + 1) * total / peakCount;
      let amplitude = 0;
      for (let bin = Math.floor(start / blockSize); bin < bins.length && bin * blockSize < end; bin++) {
        const overlap = Math.min(end, bin * blockSize + bins[bin].count) - Math.max(start, bin * blockSize);
        amplitude += bins[bin].sum / bins[bin].count * Math.max(0, overlap);
      }
      return amplitude / (end - start);
    });
    const maximum = Math.max(...peaks, 0.001);
    return peaks.map((peak) => peak / maximum);
  } finally {
    clearTimeout(timeout);
    if (decoder.exitCode === null) decoder.kill();
    await exited;
  }
}
