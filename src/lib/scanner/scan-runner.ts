import { createScanStatus, resetScanStatus, finishScanStatus } from "./progress";
import { discoverRoots } from "./discovery";
import { validateLibraryRoot } from "./validation";
import { markRemovedFiles } from "./reconcile";
import path from "path";

import type {
  AudioFileRepository,
  PathValidation,
  ScanStatus,
  ScannerService,
  SettingsRepository,
} from "@yard-core";

import type { FileSystemSeam, MetadataSeam, ExistingFileRecord, MetadataUpdateRecord } from "./types";
export type { FileSystemSeam, MetadataSeam } from "./types";
import { createMetadataQueue } from "./metadata-queue";

const METADATA_CONCURRENCY = 16;
const METADATA_WRITE_BATCH_SIZE = 250;

export class ScanRunner implements ScannerService {
  private fileRepo: AudioFileRepository;
  private settingsRepo: SettingsRepository;
  private getLibraryRoots: () => string[];
  private fs: FileSystemSeam;
  private metadataExtractor: MetadataSeam;
  private onProgress?: (status: ScanStatus) => void;

  private status = createScanStatus();

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
    return validateLibraryRoot(inputPath, this.fs);
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

  private phaseContext() {
    return { fileRepo: this.fileRepo, fs: this.fs, status: this.status, emitProgress: () => this.emitProgress(), incrementScanErrors: () => this.incrementScanErrors() };
  }

  private emitProgress() {
    this.onProgress?.({ ...this.status });
  }

  private resetScanStatus(libraryRoot: string) { resetScanStatus(this.status, libraryRoot); this.emitProgress(); }

  private incrementScanErrors(count = 1) {
    this.status.errors += count;
    this.status.failed = this.status.errors;
  }

  

  private flushMetadataUpdates(metadataUpdates: MetadataUpdateRecord[]) {
    if (metadataUpdates.length === 0) {
      return;
    }

    const batch = metadataUpdates.slice();
    this.fileRepo.batchUpdateFileMetadata(batch, new Date().toISOString());
    metadataUpdates.splice(0, batch.length);
  }

  private markRemovedFiles(allExistingFiles: ExistingFileRecord[], seenPaths: Set<string>, now: string) { return markRemovedFiles(this.phaseContext(), allExistingFiles, seenPaths, now); }

  private async runScan(libraryRoots: string[]) {
    let metadataQueue: ReturnType<typeof createMetadataQueue> | null = null;
    const metadataUpdates: MetadataUpdateRecord[] = [];

    try {
      const seenPaths = new Set<string>();
      const allExistingFiles = this.fileRepo.getAllFilesIncludingRemoved();
      const lastScannedAt = new Date().toISOString();
      metadataQueue = createMetadataQueue(
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

      const healthyRoots = await discoverRoots(this.phaseContext(), libraryRoots, lastScannedAt, seenPaths, metadataQueue);

      this.status.phase = "metadata";
      this.emitProgress();
      await metadataQueue.onIdle();
      this.flushMetadataUpdates(metadataUpdates);

      this.markRemovedFiles(allExistingFiles.filter((file) => file.libraryRoot !== null && healthyRoots.has(file.libraryRoot)), seenPaths, lastScannedAt);

      finishScanStatus(this.status);
      this.emitProgress();
    } catch (error) {
      metadataQueue?.cancel();
      try { this.flushMetadataUpdates(metadataUpdates); } catch (flushError) { console.error("Could not persist buffered scan metadata", flushError); }
      finishScanStatus(this.status, error);
      this.emitProgress();
    } finally {
      this.status.running = false;
      this.emitProgress();
    }
  }
}
