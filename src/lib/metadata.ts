import * as mm from 'music-metadata';
import * as fs from 'fs';
import * as path from 'path';

export interface AudioMetadata {
  filename: string;
  format: string | null;
  duration: number | null;
  sampleRate: number | null;
  bitDepth: number | null;
  channels: number | null;
  fileSize: number | null;
}

export async function extractMetadata(filePath: string): Promise<AudioMetadata> {
  const stats = fs.statSync(filePath);
  const filename = path.basename(filePath);
  const ext = path.extname(filePath).toLowerCase().slice(1) || null;

  try {
    const metadata = await mm.parseFile(filePath);
    return {
      filename,
      format: ext,
      duration: metadata.format.duration ?? null,
      sampleRate: metadata.format.sampleRate ?? null,
      bitDepth: metadata.format.bitsPerSample ?? null,
      channels: metadata.format.numberOfChannels ?? null,
      fileSize: stats.size,
    };
  } catch {
    return {
      filename,
      format: ext,
      duration: null,
      sampleRate: null,
      bitDepth: null,
      channels: null,
      fileSize: stats.size,
    };
  }
}