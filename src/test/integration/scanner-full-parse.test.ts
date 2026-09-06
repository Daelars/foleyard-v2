import fs from "node:fs";
import path from "node:path";
import { expect, it, vi } from "vitest";

import { createScratchLibrary, createTestDatabase, type TestDatabase } from "@/test/fixtures";
import type { ScratchLibrary } from "@/test/fixtures";
import { SqliteAudioFileRepository } from "@/lib/database/file-repository";
import { SqliteSettingsRepository } from "@/lib/database/settings-repository";
import { extractMetadata } from "@/lib/metadata";
import { RealFileSystemSeam } from "@/lib/scanner/filesystem";
import { ScanRunner } from "@/lib/scanner/scan-runner";

// Area: scanner (B05), with the real extractor instead of the mocked one.
// A WAV whose fmt/data chunks sit behind 64 KiB of JUNK is blind to the
// 32 KiB header parse; the first scan must still resolve its duration via
// the same-job full-parse escalation.
function writeWavWithLeadingJunk(target: string, seconds = 1, sampleRate = 22050) {
  const frames = seconds * sampleRate;
  const data = Buffer.alloc(frames * 2);
  for (let i = 0; i < frames; i++) {
    data.writeInt16LE(Math.floor(20000 * Math.sin((2 * Math.PI * 440 * i) / sampleRate)), i * 2);
  }
  const junkSize = 65536;
  const junk = Buffer.alloc(8 + junkSize);
  junk.write("JUNK", 0);
  junk.writeUInt32LE(junkSize, 4);
  const fmt = Buffer.alloc(24);
  fmt.write("fmt ", 0); fmt.writeUInt32LE(16, 4); fmt.writeUInt16LE(1, 8);
  fmt.writeUInt16LE(1, 10); fmt.writeUInt32LE(sampleRate, 12);
  fmt.writeUInt32LE(sampleRate * 2, 16); fmt.writeUInt16LE(2, 20); fmt.writeUInt16LE(16, 22);
  const dataHeader = Buffer.alloc(8);
  dataHeader.write("data", 0); dataHeader.writeUInt32LE(data.length, 4);
  const riff = Buffer.alloc(12);
  riff.write("RIFF", 0);
  riff.writeUInt32LE(4 + junk.length + fmt.length + dataHeader.length + data.length, 4);
  riff.write("WAVE", 8);
  fs.writeFileSync(target, Buffer.concat([riff, junk, fmt, dataHeader, data]));
}

async function runScanToIdle(runner: ScanRunner, timeoutMs = 30000) {
  const started = runner.startScan();
  expect(started.started, "the scan starts").toBe(true);
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (!runner.getStatus().running) return runner.getStatus();
    if (Date.now() > deadline) throw new Error("scan did not finish in time");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

it("resolves duration past the header window on the first scan", { timeout: 60000 }, async () => {
  const scratch: ScratchLibrary = createScratchLibrary("foleyard-scan-junk-");
  const sqlite: TestDatabase = createTestDatabase();
  vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    const target = path.join(scratch.root, "junk.wav");
    writeWavWithLeadingJunk(target);

    const headerOnly = await extractMetadata(target, { fullParse: false }).catch(() => null);
    expect(headerOnly?.duration ?? null, "the 32 KiB window cannot see past the JUNK").toBeNull();

    const files = new SqliteAudioFileRepository(sqlite);
    const settings = new SqliteSettingsRepository(sqlite);
    settings.setLibraryRoots([scratch.root]);
    const runner = new ScanRunner({
      fileRepo: files as never,
      settingsRepo: settings as never,
      getLibraryRoots: () => settings.getLibraryRoots(),
      fs: new RealFileSystemSeam(),
      metadataExtractor: { extract: extractMetadata },
    });

    const status = await runScanToIdle(runner);
    expect(status.metadataProcessed).toBe(1);
    expect(files.getFileByPath(target)?.duration).toBeCloseTo(1, 1);

    // And the second scan is fully warm: no rework for the escalated file.
    const warm = await runScanToIdle(runner);
    expect(warm.updated).toBe(0);
    expect(warm.metadataProcessed).toBe(0);
  } finally {
    vi.restoreAllMocks();
    sqlite.close();
    scratch.dispose();
  }
});
