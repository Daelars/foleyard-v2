import { spawn } from "node:child_process";
import ffmpegPath from "ffmpeg-static";

/**
 * Decode a Library file to mono 48 kHz float samples for inference
 * (#195). CLAP eats 48 kHz mono; ffmpeg (already a dependency for the
 * waveform path) converts anything it can open, resamples, and
 * downmixes. Files ffmpeg cannot open fail with a reason naming the
 * file instead of stalling the job.
 */
export async function decodeToMono48k(filePath: string): Promise<Float32Array> {
  if (!ffmpegPath) throw new Error("Audio decoding is unavailable on this platform");
  const executable = ffmpegPath.replace(/app\.asar([\\/])/, "app.asar.unpacked$1");
  const decoder = spawn(
    executable,
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-nostdin",
      "-protocol_whitelist",
      "file,pipe",
      "-threads",
      "1",
      "-i",
      filePath,
      "-map",
      "0:a:0",
      "-vn",
      "-sn",
      "-dn",
      "-ac",
      "1",
      "-ar",
      "48000",
      "-threads",
      "1",
      "-f",
      "f32le",
      "-acodec",
      "pcm_f32le",
      "pipe:1",
    ],
    { windowsHide: true, stdio: ["ignore", "pipe", "ignore"] },
  );
  const exited = new Promise<{ code: number | null; error?: Error }>((resolve) => {
    decoder.once("error", (error) => resolve({ code: null, error }));
    decoder.once("close", (code) => resolve({ code }));
  });
  const timeout = setTimeout(() => decoder.kill(), 300_000);
  timeout.unref();
  const chunks: Buffer[] = [];
  try {
    for await (const chunk of decoder.stdout) {
      chunks.push(chunk as Buffer);
    }
    const result = await exited;
    if (result.error) throw result.error;
    if (result.code !== 0) {
      throw new Error(`Could not decode ${filePath} for analysis (ffmpeg exited ${result.code})`);
    }
    const bytes = Buffer.concat(chunks);
    const samples = new Float32Array(bytes.length / 4);
    for (let offset = 0; offset + 4 <= bytes.length; offset += 4) {
      samples[offset / 4] = bytes.readFloatLE(offset);
    }
    if (samples.length === 0) {
      throw new Error(`Could not decode ${filePath} for analysis (no audio)`);
    }
    return samples;
  } finally {
    clearTimeout(timeout);
    if (decoder.exitCode === null) decoder.kill();
    await exited;
  }
}
