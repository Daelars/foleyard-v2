import { open } from "node:fs/promises";
import { setImmediate } from "node:timers/promises";
import path from "node:path";
import { decodeWaveform } from "./waveform-decoder";

export const WAVEFORM_PEAK_COUNT = 512;
export type WaveformPeaks = { peaks: number[]; supported: boolean };
const neutral = (): WaveformPeaks => ({ peaks: Array(WAVEFORM_PEAK_COUNT).fill(0), supported: false });

/** Read bounded blocks, including every channel and the final partial peak bin. */
export async function generateWaveform(filePath: string): Promise<WaveformPeaks> {
  if ([".mp3", ".ogg", ".opus", ".flac", ".aif", ".aiff", ".aac", ".m4a", ".mp4"].includes(path.extname(filePath).toLowerCase())) {
    const peaks = await decodeWaveform(filePath, WAVEFORM_PEAK_COUNT);
    return peaks ? { peaks, supported: true } : neutral();
  }
  const file = await open(filePath, "r");
  try {
    const size = (await file.stat()).size;
    const header = Buffer.alloc(40);
    if ((await file.read(header, 0, 12, 0)).bytesRead !== 12 ||
        header.toString("ascii", 0, 4) !== "RIFF" || header.toString("ascii", 8, 12) !== "WAVE") return neutral();
    const riffEnd = Math.min(size, header.readUInt32LE(4) + 8);
    let format = 0, channels = 0, bits = 0, alignment = 0;
    let dataStart = 0, dataLength = 0;
    for (let offset = 12; offset + 8 <= riffEnd;) {
      if ((await file.read(header, 0, 8, offset)).bytesRead !== 8) return neutral();
      const id = header.toString("ascii", 0, 4);
      const length = header.readUInt32LE(4);
      const start = offset + 8;
      if (start + length > riffEnd) return neutral();
      if (id === "fmt ") {
        if (length < 16) return neutral();
        const readLength = Math.min(length, 40);
        if ((await file.read(header, 0, readLength, start)).bytesRead !== readLength) return neutral();
        format = header.readUInt16LE(0);
        channels = header.readUInt16LE(2);
        alignment = header.readUInt16LE(12);
        bits = header.readUInt16LE(14);
        if (format === 0xfffe) {
          // WAVE_FORMAT_EXTENSIBLE carries the PCM/IEEE subtype in its GUID.
          if (length < 40 || header.readUInt16LE(16) < 22 ||
              header.toString("hex", 28, 40) !== "00001000800000aa00389b71") return neutral();
          format = header.readUInt32LE(24);
        }
      } else if (id === "data" && dataStart === 0) {
        dataStart = start;
        dataLength = length;
      }
      offset = start + length + (length % 2);
    }
    const bytes = bits / 8;
    if (!channels || channels > 64 || alignment !== channels * bytes || !dataStart ||
        !((format === 1 && [8, 16, 24, 32].includes(bits)) ||
          (format === 3 && [32, 64].includes(bits)))) return neutral();
    const frames = Math.floor(dataLength / alignment);
    if (!frames) return { peaks: Array(WAVEFORM_PEAK_COUNT).fill(0), supported: true };
    const peaks = Array<number>(WAVEFORM_PEAK_COUNT).fill(0);
    const counts = Array<number>(WAVEFORM_PEAK_COUNT).fill(0);
    const buffer = Buffer.alloc(Math.max(alignment, Math.floor(65536 / alignment) * alignment));
    let frame = 0;
    while (frame < frames) {
      const wanted = Math.min(buffer.length, (frames - frame) * alignment);
      const { bytesRead } = await file.read(buffer, 0, wanted, dataStart + frame * alignment);
      if (bytesRead !== wanted) return neutral();
      for (let offset = 0; offset < bytesRead; offset += alignment, frame++) {
        const bin = Math.min(WAVEFORM_PEAK_COUNT - 1, Math.floor(frame * WAVEFORM_PEAK_COUNT / frames));
        for (let channel = 0; channel < channels; channel++) {
          const pos = offset + channel * bytes;
          const sample = format === 3
            ? (bits === 32 ? buffer.readFloatLE(pos) : buffer.readDoubleLE(pos))
            : bits === 8 ? (buffer[pos] - 128) / 128
            : buffer.readIntLE(pos, bytes) / 2 ** (bits - 1);
          peaks[bin] += Number.isFinite(sample) ? Math.min(1, Math.abs(sample)) : 0;
          counts[bin]++;
        }
      }
      // Bound both allocation and work per turn even when many rows request peaks.
      await setImmediate();
    }
    for (let i = 0; i < peaks.length; i++) peaks[i] = counts[i] ? peaks[i] / counts[i] : 0;
    const maximum = Math.max(...peaks, 0.001);
    return { peaks: peaks.map((peak) => peak / maximum), supported: true };
  } finally {
    await file.close();
  }
}

export function resizeWaveform(peaks: number[], count: number) {
  return Array.from({ length: count }, (_, index) => {
    const start = Math.floor(index * peaks.length / count);
    const end = Math.max(start + 1, Math.floor((index + 1) * peaks.length / count));
    let sum = 0;
    for (let i = start; i < end; i++) sum += peaks[i];
    return sum / (end - start);
  });
}
