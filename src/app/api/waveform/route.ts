import { NextRequest, NextResponse } from "next/server";
import * as fs from "fs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_PEAK_COUNT = 180;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const pathParam = searchParams.get("path");

  if (!pathParam) {
    return NextResponse.json({ error: "No file path provided" }, { status: 400 });
  }

  const filePath = decodeURIComponent(pathParam);

  try {
    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    const fileBuffer = fs.readFileSync(filePath);
    const peakCount = Number(searchParams.get("peaks") ?? DEFAULT_PEAK_COUNT);
    const peaks = extractPeaks(fileBuffer, filePath, peakCount);

    return NextResponse.json({ peaks });
  } catch (error) {
    console.error("Waveform generation error:", error);
    return NextResponse.json({ error: "Failed to generate waveform" }, { status: 500 });
  }
}

function extractPeaks(buffer: Buffer, filePath: string, peakCount: number) {
  const normalizedPeakCount = Math.max(32, Math.min(512, peakCount));
  const extension = filePath.split(".").pop()?.toLowerCase();

  if (extension === "wav") {
    const wavPeaks = extractWavPeaks(buffer, normalizedPeakCount);
    if (wavPeaks) {
      return wavPeaks;
    }
  }

  return createSeededPeaks(filePath, normalizedPeakCount);
}

function extractWavPeaks(buffer: Buffer, peakCount: number) {
  if (
    buffer.toString("ascii", 0, 4) !== "RIFF" ||
    buffer.toString("ascii", 8, 12) !== "WAVE"
  ) {
    return null;
  }

  let offset = 12;
  let dataOffset = -1;
  let dataLength = 0;

  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.toString("ascii", offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);

    if (chunkId === "data") {
      dataOffset = offset + 8;
      dataLength = chunkSize;
      break;
    }

    offset += 8 + chunkSize;
  }

  if (dataOffset === -1 || dataLength <= 0) {
    return null;
  }

  const totalSamples = Math.floor(dataLength / 2);
  const samplesPerPeak = Math.max(1, Math.floor(totalSamples / peakCount));
  const peaks: number[] = [];

  for (let peakIndex = 0; peakIndex < peakCount; peakIndex += 1) {
    const sampleStart = peakIndex * samplesPerPeak;
    const sampleEnd = Math.min(totalSamples, sampleStart + samplesPerPeak);

    let sum = 0;
    let count = 0;

    for (let sampleIndex = sampleStart; sampleIndex < sampleEnd; sampleIndex += 1) {
      const byteOffset = dataOffset + sampleIndex * 2;
      if (byteOffset + 1 >= buffer.length) {
        break;
      }

      sum += Math.abs(buffer.readInt16LE(byteOffset));
      count += 1;
    }

    peaks.push(count > 0 ? sum / count / 32768 : 0);
  }

  const maxPeak = Math.max(...peaks, 0.001);
  return peaks.map((peak) => Math.max(0.04, peak / maxPeak));
}

function createSeededPeaks(seed: string, peakCount: number) {
  let hash = 0;

  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash << 5) - hash + seed.charCodeAt(index);
    hash |= 0;
  }

  const peaks: number[] = [];
  let state = Math.abs(hash) || 1;

  for (let index = 0; index < peakCount; index += 1) {
    state = (state * 1664525 + 1013904223) % 4294967296;
    const noise = state / 4294967296;
    const contour = Math.sin((index / peakCount) * Math.PI * 1.2) * 0.18;
    peaks.push(Math.max(0.08, Math.min(1, 0.18 + noise * 0.62 + contour)));
  }

  return peaks;
}
