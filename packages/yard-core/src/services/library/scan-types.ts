export const SUPPORTED_AUDIO_EXTENSIONS = [
  ".mp3",
  ".wav",
  ".ogg",
  ".flac",
  ".aiff",
  ".m4a",
  ".aac",
] as const;

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
  libraryRoot?: string | null;
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
  return createExtensionMatcher(SUPPORTED_AUDIO_EXTENSIONS)(fileName);
}

/**
 * Canonical extension matching over any list: dot-prefix and case are
 * normalized, and the final extension wins (`a.b.c.FLAC` matches `.flac`).
 * Tools keep their own default lists but share this comparison.
 */
export function createExtensionMatcher(extensions: Iterable<string>) {
  const normalized = new Set<string>();
  for (const extension of extensions) {
    const lower = extension.toLowerCase();
    normalized.add(lower.startsWith(".") ? lower : `.${lower}`);
  }
  return (fileName: string) => {
    const lastDotIndex = fileName.lastIndexOf(".");
    if (lastDotIndex < 0) {
      return false;
    }
    return normalized.has(fileName.slice(lastDotIndex).toLowerCase());
  };
}
