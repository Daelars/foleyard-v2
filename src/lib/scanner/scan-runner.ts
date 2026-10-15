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

import type { FileSystemSeam, MetadataSeam, MetadataUpdateRecord, ScanCleanupRow } from "./types";
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
  private onComplete?: (completion: { startedAt: string; fileIds: string[] }) => void;
  private recoverDeletions?: () => Promise<unknown>;

  private status = createScanStatus();

  private activeScan: Promise<void> | null = null;

  constructor(deps: {
    fileRepo: AudioFileRepository;
    settingsRepo: SettingsRepository;
    getLibraryRoots: () => string[];
    fs: FileSystemSeam;
    metadataExtractor: MetadataSeam;
    onProgress?: (status: ScanStatus) => void;
    /**
     * Reconciliation for permanent deletions interrupted before the index
     * caught up (#269). Runs once per scan before discovery, and never fails
     * the scan: the intents stay journaled for the next attempt.
     */
    recoverDeletions?: () => Promise<unknown>;
    /**
     * Fires once per finished run, success or failure, with the files the
     * run actually added or updated. Arrivals that landed before a failure
     * are real, and deterministic tagging is idempotent, so there is
     * nothing to gain by skipping failed runs.
     */
    onComplete?: (completion: { startedAt: string; fileIds: string[] }) => void;
  }) {
    this.fileRepo = deps.fileRepo;
    this.settingsRepo = deps.settingsRepo;
    this.getLibraryRoots = deps.getLibraryRoots;
    this.fs = deps.fs;
    this.metadataExtractor = deps.metadataExtractor;
    this.onProgress = deps.onProgress;
    this.recoverDeletions = deps.recoverDeletions;
    this.onComplete = deps.onComplete;
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

  private markRemovedFiles(allExistingFiles: ScanCleanupRow[], seenPaths: Set<string>, now: string, addedFileIds: string[]) { return markRemovedFiles(this.phaseContext(), allExistingFiles, seenPaths, now, addedFileIds); }

  private async runScan(libraryRoots: string[]) {
    let metadataQueue: ReturnType<typeof createMetadataQueue> | null = null;
    const metadataUpdates: MetadataUpdateRecord[] = [];
    // Files actually added or updated by this run, in discovery order.
    // Collected outside the try so a partial failure still hands off the
    // arrivals that landed (#234).
    const arrivals: string[] = [];
    // Files this run inserted for the first time; the only valid move
    // targets for reconciliation (#274).
    const addedIds: string[] = [];
    let lastScannedAt = new Date().toISOString();

    try {
      const seenPaths = new Set<string>();
      // Finish permanent deletions interrupted before the index caught up
      // (#269). This never unlinks and never fails the scan: an intent that
      // cannot be inspected stays journaled for the next pass.
      try {
        await this.recoverDeletions?.();
      } catch (error) {
        console.warn("Could not reconcile interrupted deletions", error);
      }
      // Narrow scan-cleanup projection: removal reconciliation only needs
      // path, library root and removed state, so a large library is not
      // fully materialized through the repository mapping for every scan.
      const allExistingFiles = this.fileRepo.getScanCleanupRows();
      lastScannedAt = new Date().toISOString();
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

      const healthyRoots = await discoverRoots(this.phaseContext(), libraryRoots, lastScannedAt, seenPaths, metadataQueue, arrivals, addedIds);

      this.status.phase = "metadata";
      this.emitProgress();
      await metadataQueue.onIdle();
      this.flushMetadataUpdates(metadataUpdates);

      this.markRemovedFiles(allExistingFiles.filter((file) => file.libraryRoot !== null && healthyRoots.has(file.libraryRoot)), seenPaths, lastScannedAt, addedIds);

      finishScanStatus(this.status);
      // Refresh SQLite query statistics after the import so browse queries
      // get the ordered index plans the statistics were measured for. This
      // runs outside the interactive request path; a failure is not worth
      // failing the scan over.
      try {
        this.fileRepo.analyzeStatistics();
      } catch (error) {
        console.warn("Could not refresh query statistics after scan", error);
      }
      this.emitProgress();
    } catch (error) {
      metadataQueue?.cancel();
      try { this.flushMetadataUpdates(metadataUpdates); } catch (flushError) { console.error("Could not persist buffered scan metadata", flushError); }
      finishScanStatus(this.status, error);
      this.emitProgress();
    } finally {
      this.status.running = false;
      this.onComplete?.({ startedAt: lastScannedAt, fileIds: arrivals });
      this.emitProgress();
    }
  }
}
