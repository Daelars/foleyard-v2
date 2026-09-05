export interface FileSystemSeam {
  stat(filePath: string): Promise<{ size: number; mtimeMs: number }>;
  existsReadableDirectory(dirPath: string): Promise<void>;
  findFirstAudioFile(rootPath: string): Promise<string | null>;
  streamAudioFileBatches(
    rootPath: string,
    options?: {
      batchSize?: number;
      onDiscover?: (filePath: string) => void;
      onError?: (directory: string, error: unknown) => void;
      maxDepth?: number;
    },
  ): AsyncGenerator<string[], void, void>;
}

export interface MetadataSeam {
  extract(
    filePath: string,
    options?: {
      fileSize?: number;
      filename?: string;
      format?: string | null;
      fullParse?: boolean;
    },
  ): Promise<{
    filename: string;
    format: string | null;
    codec: string | null;
    duration: number | null;
    sampleRate: number | null;
    bitDepth: number | null;
    channels: number | null;
    fileSize: number | null;
  }>;
}

export type ExistingFileRecord = {
  id: string;
  path: string;
  filename: string;
  libraryRoot: string | null;
  directory: string | null;
  format: string | null;
  duration: number | null;
  sampleRate: number | null;
  bitDepth: number | null;
  channels: number | null;
  fileSize: number | null;
  isFavorite: boolean;
  removedAt: string | null;
  lastScannedAt: string | null;
  mtimeMs: number | null;
};

export type MetadataUpdateRecord = {
  path: string;
  codec: string | null;
  duration: number | null;
  sampleRate: number | null;
  bitDepth: number | null;
  channels: number | null;
  fileSize: number | null;
};

export type MetadataTask = {
  fullParse?: boolean;
  filePath: string;
  fileSize: number;
  filename: string;
  format: string | null;
};


export type ScanPhaseContext = {
  fileRepo: import("@yard-core").AudioFileRepository;
  fs: FileSystemSeam;
  status: import("@yard-core").ScanStatus;
  emitProgress(): void;
  incrementScanErrors(): void;
};

export interface ScanStatusResponse {
  running: boolean;
  phase: string;
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
  error: string | null;
}

export const emptyScanStatus: ScanStatusResponse = {
  running: false,
  phase: "idle",
  discovered: 0,
  indexed: 0,
  skippedUnchanged: 0,
  metadataProcessed: 0,
  added: 0,
  updated: 0,
  removed: 0,
  failed: 0,
  errors: 0,
  total: 0,
  error: null,
};
