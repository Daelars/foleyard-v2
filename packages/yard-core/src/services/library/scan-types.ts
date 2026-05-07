export const SUPPORTED_AUDIO_EXTENSIONS = [
  ".mp3",
  ".wav",
  ".ogg",
  ".flac",
  ".aiff",
  ".m4a",
  ".aac",
] as const;

const SUPPORTED_AUDIO_EXTENSION_SET = new Set<string>(SUPPORTED_AUDIO_EXTENSIONS);

export type ScanPhase =
  | "idle"
  | "validating"
  | "discovering"
  | "indexing"
  | "metadata"
  | "cleaning"
  | "complete"
  | "error";

export interface ScanSummary {
  discovered: number;
  indexed: number;
  skippedUnchanged: number;
  metadataProcessed: number;
  added: number;
  updated: number;
  removed: number;
  failed: number;
  errors: number;
  finishedAt: string | null;
}

export interface ScanStatus {
  running: boolean;
  phase: ScanPhase;
  discovered: number;
  indexed: number;
  skippedUnchanged: number;
  metadataProcessed: number;
  added: number;
  updated: number;
  removed: number;
  failed: number;
  errors: number;
  total: number;
  startedAt: string | null;
  finishedAt: string | null;
  error: string | null;
  libraryRoot: string | null;
  lastScanSummary: ScanSummary | null;
}

export interface PathValidation {
  valid: boolean;
  normalizedPath: string | null;
  readable: boolean;
  audioFileCount: number;
  samples: string[];
  error: string | null;
}

export interface ScanFileRecord {
  path: string;
  filename: string;
  directory: string | null;
  format: string | null;
  codec: string | null;
  duration: number | null;
  sampleRate: number | null;
  bitDepth: number | null;
  channels: number | null;
  fileSize: number | null;
  mtimeMs: number;
  removedAt: string | null;
  lastScannedAt: string;
}

export function isSupportedAudioFile(fileName: string) {
  const lastDotIndex = fileName.lastIndexOf(".");
  if (lastDotIndex < 0) {
    return false;
  }

  return SUPPORTED_AUDIO_EXTENSION_SET.has(fileName.slice(lastDotIndex).toLowerCase());
}
