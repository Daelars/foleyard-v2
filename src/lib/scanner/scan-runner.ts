import path from "path";

import type {
  AudioFileRepository,
  PathValidation,
  ScanFileRecord,
  ScanStatus,
  ScannerService,
  SettingsRepository,
} from "@yard-core";

export interface FileSystemSeam {
  stat(filePath: string): Promise<{ size: number; mtimeMs: number }>;
  existsReadableDirectory(dirPath: string): Promise<void>;
  findFirstAudioFile(rootPath: string): Promise<string | null>;
  streamAudioFileBatches(
    rootPath: string,
    options?: {
      batchSize?: number;
      onDiscover?: (filePath: string) => void;
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

type ExistingFileRecord = {
  id: string;
  path: string;
  filename: string;
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

type MetadataUpdateRecord = {
  path: string;
  codec: string | null;
  duration: number | null;
  sampleRate: number | null;
  bitDepth: number | null;
  channels: number | null;
  fileSize: number | null;
};

type MetadataTask = {
  filePath: string;
  fileSize: number;
  filename: string;
  format: string | null;
};

const DISCOVERY_BATCH_SIZE = 500;
const METADATA_CONCURRENCY = 8;
const METADATA_WRITE_BATCH_SIZE = 250;

function normalizeDirectory(rootPath: string, filePath: string) {
  const relativeDirectory = path.relative(rootPath, path.dirname(filePath));
  return relativeDirectory === "." ? null : relativeDirectory || null;
}

function normalizeStoredDirectory(directory: string | null | undefined) {
  return directory == null ? null : directory.replace(/\\/g, "/");
}

function createMetadataQueue(
  concurrency: number,
  onResult: (record: MetadataUpdateRecord) => void,
  extractor: MetadataSeam,
  onError: () => void,
) {
  const pending: MetadataTask[] = [];
  let activeCount = 0;
  let fatalError: Error | null = null;

  const runNext = () => {
    while (activeCount < concurrency && pending.length > 0 && !fatalError) {
      const task = pending.shift()!;
      activeCount += 1;

      (async () => {
        try {
          let metadata;
          try {
            metadata = await extractor.extract(task.filePath, {
              fileSize: task.fileSize,
              filename: task.filename,
              format: task.format,
              fullParse: false,
            });
          } catch {
            onError();
            return;
          }

          onResult({
            path: task.filePath,
            codec: metadata.codec,
            duration: metadata.duration,
            sampleRate: metadata.sampleRate,
            bitDepth: metadata.bitDepth,
            channels: metadata.channels,
            fileSize: metadata.fileSize,
          });
        } catch (error) {
          fatalError = error instanceof Error ? error : new Error(String(error));
        } finally {
          activeCount -= 1;
          runNext();
        }
      })();
    }
  };

  return {
    enqueue(task: MetadataTask) {
      if (fatalError) {
        throw fatalError;
      }

      pending.push(task);
      runNext();
    },
    async onIdle(timeoutMs = 30000) {
      if (fatalError) {
        throw fatalError;
      }

      if (activeCount === 0 && pending.length === 0) {
        return;
      }

      const start = Date.now();
      while (true) {
        await new Promise<void>((resolve) => setTimeout(resolve, 1));
        if (fatalError) {
          throw fatalError;
        }

        if (activeCount === 0 && pending.length === 0) {
          return;
        }

        if (Date.now() - start > timeoutMs) {
          throw new Error("Metadata queue timed out");
        }
      }
    },
  };
}

export class ScanRunner implements ScannerService {
  private fileRepo: AudioFileRepository;
  private settingsRepo: SettingsRepository;
  private getLibraryRoots: () => string[];
  private fs: FileSystemSeam;
  private metadataExtractor: MetadataSeam;
  private onProgress?: (status: ScanStatus) => void;

  private status: ScanStatus = {
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
    startedAt: null,
    finishedAt: null,
    error: null,
    libraryRoot: null,
    lastScanSummary: null,
  };

  private activeScan: Promise<void> | null = null;

  constructor(deps: {
    fileRepo: AudioFileRepository;
    settingsRepo: SettingsRepository;
    getLibraryRoots: () => string[];
    fs: FileSystemSeam;
    metadataExtractor: MetadataSeam;
    onProgress?: (status: ScanStatus) => void;
  }) {
    this.fileRepo = deps.fileRepo;
    this.settingsRepo = deps.settingsRepo;
    this.getLibraryRoots = deps.getLibraryRoots;
    this.fs = deps.fs;
    this.metadataExtractor = deps.metadataExtractor;
    this.onProgress = deps.onProgress;
  }

  getStatus(): ScanStatus {
    return { ...this.status };
  }

  async validateLibraryRoot(inputPath: string): Promise<PathValidation> {
    const normalizedPath = path.resolve(inputPath.trim());

    try {
      await this.fs.existsReadableDirectory(normalizedPath);
      const firstAudioFile = await this.fs.findFirstAudioFile(normalizedPath);

      return {
        valid: true,
        normalizedPath,
        readable: true,
        audioFileCount: firstAudioFile ? 1 : 0,
        samples: firstAudioFile ? [path.relative(normalizedPath, firstAudioFile)] : [],
        error: null,
      };
    } catch (error) {
      return {
        valid: false,
        normalizedPath,
        readable: false,
        audioFileCount: 0,
        samples: [],
        error: error instanceof Error ? error.message : "Validation failed",
      };
    }
  }

  saveLibraryRoot(libraryRoot: string): void {
    this.settingsRepo.setLibraryRoot(libraryRoot);
  }

  startScan(): { started: boolean; reason?: string; status: ScanStatus } {
    if (this.status.running) {
      return {
        started: false,
        reason: "already-running",
        status: this.getStatus(),
      };
    }

    const libraryRoots = this.getLibraryRoots();
    if (libraryRoots.length === 0) {
      return {
        started: false,
        reason: "missing-root",
        status: this.getStatus(),
      };
    }

    this.resetScanStatus(libraryRoots.join(path.delimiter));

    this.activeScan = this.runScan(libraryRoots);
    void this.activeScan.finally(() => {
      this.activeScan = null;
    });

    return { started: true, status: this.getStatus() };
  }

  private emitProgress() {
    this.onProgress?.({ ...this.status });
  }

  private resetScanStatus(libraryRoot: string) {
    Object.assign(this.status, {
      running: true,
      phase: "validating" as const,
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
      startedAt: new Date().toISOString(),
      finishedAt: null,
      error: null,
      libraryRoot,
      lastScanSummary: null,
    });
    this.emitProgress();
  }

  private incrementScanErrors(count = 1) {
    this.status.errors += count;
    this.status.failed = this.status.errors;
  }

  private async processDiscoveredBatch(
    filePaths: string[],
    normalizedRoot: string,
    lastScannedAt: string,
    seenPaths: Set<string>,
    metadataQueue: ReturnType<typeof createMetadataQueue>,
  ) {
    const existingByPath = new Map(
      this.fileRepo.getFilesByPaths(filePaths).map((file) => [file.path, file]),
    );
    const touchEntries: { path: string; lastScannedAt: string }[] = [];
    const upsertRecords: ScanFileRecord[] = [];

    const statResults = await Promise.all(
      filePaths.map(async (filePath) => {
        try {
          const stats = await this.fs.stat(filePath);
          return { filePath, stats };
        } catch {
          this.incrementScanErrors();
          return null;
        }
      }),
    );

    for (const result of statResults) {
      if (!result) {
        continue;
      }

      const { filePath, stats } = result;
      const existing = existingByPath.get(filePath);
      const filename = path.basename(filePath);
      const format = path.extname(filePath).toLowerCase().slice(1) || null;
      const mtimeMs = Math.trunc(stats.mtimeMs);
      const directory = normalizeDirectory(normalizedRoot, filePath);
      const changed =
        !existing ||
        existing.fileSize !== stats.size ||
        existing.mtimeMs !== mtimeMs ||
        existing.removedAt !== null ||
        normalizeStoredDirectory(existing.directory) !== normalizeStoredDirectory(directory);

      seenPaths.add(filePath);
      this.status.indexed += 1;

      if (!changed && existing) {
        touchEntries.push({ path: filePath, lastScannedAt });
        this.status.skippedUnchanged += 1;
        continue;
      }

      upsertRecords.push({
        path: filePath,
        filename,
        directory,
        format,
        codec: null,
        duration: null,
        sampleRate: null,
        bitDepth: null,
        channels: null,
        fileSize: stats.size,
        mtimeMs,
        removedAt: null,
        lastScannedAt,
      });

      if (existing) {
        this.status.updated += 1;
      } else {
        this.status.added += 1;
      }
    }

    this.fileRepo.batchTouchFiles(touchEntries, lastScannedAt);
    this.fileRepo.batchUpsertFiles(upsertRecords, lastScannedAt);

    for (const record of upsertRecords) {
      metadataQueue.enqueue({
        filePath: record.path,
        fileSize: record.fileSize ?? 0,
        filename: record.filename,
        format: record.format,
      });
    }
  }

  private flushMetadataUpdates(metadataUpdates: MetadataUpdateRecord[]) {
    if (metadataUpdates.length === 0) {
      return;
    }

    const batch = metadataUpdates.splice(0, metadataUpdates.length);
    this.fileRepo.batchUpdateFileMetadata(batch, new Date().toISOString());
  }

  private markRemovedFiles(
    allExistingFiles: ExistingFileRecord[],
    seenPaths: Set<string>,
    now: string,
  ) {
    this.status.phase = "cleaning";
    this.emitProgress();
    const removedAt = new Date().toISOString();
    const removedPaths: string[] = [];

    for (const file of allExistingFiles) {
      if (seenPaths.has(file.path) || file.removedAt !== null) {
        continue;
      }

      removedPaths.push(file.path);
      this.status.removed += 1;
    }

    this.fileRepo.batchMarkRemoved(removedPaths, removedAt, now);

    const relinkedFiles = this.fileRepo.reconcileMovedFiles();
    this.status.removed = Math.max(0, this.status.removed - relinkedFiles);
  }

  private async runScan(libraryRoots: string[]) {
    this.resetScanStatus(libraryRoots.join(path.delimiter));

    try {
      const seenPaths = new Set<string>();
      const allExistingFiles = this.fileRepo.getAllFilesIncludingRemoved();
      const lastScannedAt = new Date().toISOString();
      const metadataUpdates: MetadataUpdateRecord[] = [];
      const metadataQueue = createMetadataQueue(
        METADATA_CONCURRENCY,
        (record) => {
          this.status.metadataProcessed += 1;
          metadataUpdates.push(record);

          if (metadataUpdates.length >= METADATA_WRITE_BATCH_SIZE) {
            this.flushMetadataUpdates(metadataUpdates);
          }
        },
        this.metadataExtractor,
        () => this.incrementScanErrors(),
      );

      for (const libraryRoot of libraryRoots) {
        this.status.phase = "validating";
        this.emitProgress();
        const validation = await this.validateLibraryRoot(libraryRoot);
        if (!validation.valid || !validation.normalizedPath) {
          throw new Error(validation.error ?? "Invalid library root");
        }

        const normalizedRoot = validation.normalizedPath;
        this.status.phase = "discovering";
        this.emitProgress();

        for await (const batch of this.fs.streamAudioFileBatches(normalizedRoot, {
          batchSize: DISCOVERY_BATCH_SIZE,
          onDiscover: () => {
            this.status.discovered += 1;
            this.status.total = this.status.discovered;
          },
        })) {
          this.status.phase = "indexing";
          this.emitProgress();
          await this.processDiscoveredBatch(
            batch,
            normalizedRoot,
            lastScannedAt,
            seenPaths,
            metadataQueue,
          );
        }
      }

      this.status.phase = "metadata";
      this.emitProgress();
      await metadataQueue.onIdle();
      this.flushMetadataUpdates(metadataUpdates);

      this.markRemovedFiles(allExistingFiles, seenPaths, lastScannedAt);

      this.status.phase = "complete";
      this.status.finishedAt = new Date().toISOString();
      this.status.lastScanSummary = {
        discovered: this.status.discovered,
        indexed: this.status.indexed,
        skippedUnchanged: this.status.skippedUnchanged,
        metadataProcessed: this.status.metadataProcessed,
        added: this.status.added,
        updated: this.status.updated,
        removed: this.status.removed,
        failed: this.status.failed,
        errors: this.status.errors,
        finishedAt: this.status.finishedAt,
      };
      this.emitProgress();
    } catch (error) {
      this.status.phase = "error";
      this.status.finishedAt = new Date().toISOString();
      this.status.error = error instanceof Error ? error.message : "Scan failed";
      this.emitProgress();
    } finally {
      this.status.running = false;
      this.emitProgress();
    }
  }
}
