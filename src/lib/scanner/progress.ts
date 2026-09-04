import type { ScanStatus } from "@yard-core";

export function createScanStatus(): ScanStatus { return {
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
  }; }

export function resetScanStatus(status: ScanStatus, libraryRoot: string) {
    Object.assign(status, {
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

  }

export function finishScanStatus(status: ScanStatus, error?: unknown) {
  status.phase = error === undefined ? "complete" : "error";
  status.finishedAt = new Date().toISOString();
  if (error !== undefined) {
    status.error = error instanceof Error ? error.message : "Scan failed";
    status.failed = Math.max(1, status.failed);
    status.errors = Math.max(1, status.errors);
  }
  const { discovered, indexed, skippedUnchanged, metadataProcessed, added, updated, removed, failed, errors, finishedAt } = status;
  status.lastScanSummary = { discovered, indexed, skippedUnchanged, metadataProcessed, added, updated, removed, failed, errors, finishedAt };
}
