import type { ScanStatus } from "@yard-core";

export const scanStatus: ScanStatus = {
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

export function resetScanStatus(libraryRoot: string) {
  scanStatus.running = true;
  scanStatus.phase = "validating";
  scanStatus.discovered = 0;
  scanStatus.indexed = 0;
  scanStatus.skippedUnchanged = 0;
  scanStatus.metadataProcessed = 0;
  scanStatus.added = 0;
  scanStatus.updated = 0;
  scanStatus.removed = 0;
  scanStatus.failed = 0;
  scanStatus.errors = 0;
  scanStatus.total = 0;
  scanStatus.startedAt = new Date().toISOString();
  scanStatus.finishedAt = null;
  scanStatus.error = null;
  scanStatus.libraryRoot = libraryRoot;
  scanStatus.lastScanSummary = null;
}

export function incrementScanErrors(count = 1) {
  scanStatus.errors += count;
  scanStatus.failed = scanStatus.errors;
}
