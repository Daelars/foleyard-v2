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
