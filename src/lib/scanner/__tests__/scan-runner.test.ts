import { describe, it, expect } from "vitest";
import { initializeDatabaseSchema } from "@/lib/database/migrations";
import { SqliteAudioFileRepository } from "@/lib/database/file-repository";
import { SqliteSettingsRepository } from "@/lib/database/settings-repository";
import { ScanRunner } from "../scan-runner";
import type { FileSystemSeam, MetadataSeam } from "../scan-runner";
import Database from "better-sqlite3";

function createTestDb() {
  const sqlite = new Database(":memory:");
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  initializeDatabaseSchema(sqlite);
  return sqlite;
}

class FakeFileSystem implements FileSystemSeam {
  private files: Map<string, { size: number; mtimeMs: number }> = new Map();

  setFile(path: string, size = 1000, mtimeMs = 1000000) {
    this.files.set(path, { size, mtimeMs });
  }

  deleteFile(path: string) {
    this.files.delete(path);
  }

  async stat(filePath: string) {
    const file = this.files.get(filePath);
    if (!file) throw new Error(`ENOENT: ${filePath}`);
    return file;
  }

  async existsReadableDirectory(_dirPath: string) {
  }

  async findFirstAudioFile(_rootPath: string) {
    return null;
  }

  async *streamAudioFileBatches(
    _rootPath: string,
    options?: { batchSize?: number; onDiscover?: (filePath: string) => void },
  ) {
    const paths = Array.from(this.files.keys());
    const batchSize = options?.batchSize ?? 500;
    const onDiscover = options?.onDiscover;
    for (let i = 0; i < paths.length; i += batchSize) {
      const batch = paths.slice(i, i + batchSize);
      for (const p of batch) onDiscover?.(p);
      yield batch;
    }
  }
}

class FakeMetadata implements MetadataSeam {
  async extract(
    filePath: string,
    _options?: {
      fileSize?: number;
      filename?: string;
      format?: string | null;
      fullParse?: boolean;
    },
  ) {
    return {
      filename: filePath.split("/").pop() ?? "unknown",
      format: filePath.split(".").pop() ?? null,
      codec: "mp3",
      duration: 120,
      sampleRate: 44100,
      bitDepth: 16,
      channels: 2,
      fileSize: 1000,
    };
  }
}

function waitForScan(runner: ScanRunner): Promise<void> {
  return new Promise<void>((resolve) => {
    const check = () => {
      if (!runner.getStatus().running) {
        resolve();
        return;
      }
      setTimeout(check, 5);
    };
    check();
  });
}

describe("ScanRunner", () => {
  it("fake filesystem streams correct batches", async () => {
    const fs = new FakeFileSystem();
    fs.setFile("/a.mp3");
    fs.setFile("/b.wav");
    const batches: string[][] = [];
    for await (const batch of fs.streamAudioFileBatches("/")) {
      batches.push(batch);
    }
    expect(batches).toHaveLength(1);
    expect(batches[0]).toHaveLength(2);
  });

  it("startScan returns started=true and sets running", () => {
    const sqlite = createTestDb();
    const repo = new SqliteAudioFileRepository(sqlite);
    const settings = new SqliteSettingsRepository(sqlite);
    const fs = new FakeFileSystem();
    fs.setFile("/music/a.mp3");
    const runner = new ScanRunner({
      fileRepo: repo, settingsRepo: settings,
      getLibraryRoots: () => ["/music"], fs,
      metadataExtractor: new FakeMetadata(),
    });

    const result = runner.startScan();
    expect(result.started).toBe(true);
    expect(result.status.running).toBe(true);
  });

  it("scan with one file completes and upserts", async () => {
    const sqlite = createTestDb();
    const repo = new SqliteAudioFileRepository(sqlite);
    const settings = new SqliteSettingsRepository(sqlite);
    const fs = new FakeFileSystem();
    fs.setFile("/music/song.mp3", 2000, 5000000);
    const runner = new ScanRunner({
      fileRepo: repo, settingsRepo: settings,
      getLibraryRoots: () => ["/music"], fs,
      metadataExtractor: new FakeMetadata(),
    });

    runner.startScan();
    await waitForScan(runner);

    expect(runner.getStatus().phase).toBe("complete");
    expect(runner.getStatus().added).toBe(1);
    expect(repo.getFiles()).toHaveLength(1);
    expect(repo.getFiles()[0].filename).toBe("song.mp3");
  });

  it("scan with multiple files upserts all", async () => {
    const sqlite = createTestDb();
    const repo = new SqliteAudioFileRepository(sqlite);
    const settings = new SqliteSettingsRepository(sqlite);
    const fs = new FakeFileSystem();
    fs.setFile("/music/a.mp3");
    fs.setFile("/music/b.wav");
    const runner = new ScanRunner({
      fileRepo: repo, settingsRepo: settings,
      getLibraryRoots: () => ["/music"], fs,
      metadataExtractor: new FakeMetadata(),
    });

    runner.startScan();
    await waitForScan(runner);

    expect(repo.getFileCount()).toBe(2);
  });

  it("startScan returns missing-root when no roots", () => {
    const sqlite = createTestDb();
    const repo = new SqliteAudioFileRepository(sqlite);
    const settings = new SqliteSettingsRepository(sqlite);
    const runner = new ScanRunner({
      fileRepo: repo, settingsRepo: settings,
      getLibraryRoots: () => [],
      fs: new FakeFileSystem(),
      metadataExtractor: new FakeMetadata(),
    });

    const result = runner.startScan();
    expect(result.started).toBe(false);
    expect(result.reason).toBe("missing-root");
  });

  it("startScan returns already-running on second call", () => {
    const sqlite = createTestDb();
    const repo = new SqliteAudioFileRepository(sqlite);
    const settings = new SqliteSettingsRepository(sqlite);
    const fs = new FakeFileSystem();
    fs.setFile("/music/a.mp3");
    const runner = new ScanRunner({
      fileRepo: repo, settingsRepo: settings,
      getLibraryRoots: () => ["/music"], fs,
      metadataExtractor: new FakeMetadata(),
    });

    runner.startScan();
    const second = runner.startScan();
    expect(second.started).toBe(false);
    expect(second.reason).toBe("already-running");
  });

  it("progress callback fires with phase changes", async () => {
    const sqlite = createTestDb();
    const repo = new SqliteAudioFileRepository(sqlite);
    const settings = new SqliteSettingsRepository(sqlite);
    const fs = new FakeFileSystem();
    fs.setFile("/music/a.mp3");
    const phases: string[] = [];
    const runner = new ScanRunner({
      fileRepo: repo, settingsRepo: settings,
      getLibraryRoots: () => ["/music"], fs,
      metadataExtractor: new FakeMetadata(),
      onProgress: (s) => { phases.push(s.phase); },
    });

    runner.startScan();
    await waitForScan(runner);

    expect(phases).toContain("complete");
  });

  it("skips unchanged files on second scan", async () => {
    const sqlite = createTestDb();
    const repo = new SqliteAudioFileRepository(sqlite);
    const settings = new SqliteSettingsRepository(sqlite);
    const fs = new FakeFileSystem();
    fs.setFile("/music/a.mp3", 1000, 1000000);
    const runner = new ScanRunner({
      fileRepo: repo, settingsRepo: settings,
      getLibraryRoots: () => ["/music"], fs,
      metadataExtractor: new FakeMetadata(),
    });

    runner.startScan();
    await waitForScan(runner);
    expect(runner.getStatus().added).toBe(1);

    runner.startScan();
    await waitForScan(runner);
    expect(runner.getStatus().skippedUnchanged).toBe(1);
    expect(runner.getStatus().added).toBe(0);
  });

  it("detects changed files by mtime", async () => {
    const sqlite = createTestDb();
    const repo = new SqliteAudioFileRepository(sqlite);
    const settings = new SqliteSettingsRepository(sqlite);
    const fs = new FakeFileSystem();
    fs.setFile("/music/a.mp3", 1000, 1000000);
    const runner = new ScanRunner({
      fileRepo: repo, settingsRepo: settings,
      getLibraryRoots: () => ["/music"], fs,
      metadataExtractor: new FakeMetadata(),
    });

    runner.startScan();
    await waitForScan(runner);

    fs.setFile("/music/a.mp3", 1000, 2000000);
    runner.startScan();
    await waitForScan(runner);

    expect(runner.getStatus().updated).toBe(1);
  });

  it("marks removed files", async () => {
    const sqlite = createTestDb();
    const repo = new SqliteAudioFileRepository(sqlite);
    const settings = new SqliteSettingsRepository(sqlite);
    const fs = new FakeFileSystem();
    fs.setFile("/music/a.mp3");
    fs.setFile("/music/b.wav");
    const runner = new ScanRunner({
      fileRepo: repo, settingsRepo: settings,
      getLibraryRoots: () => ["/music"], fs,
      metadataExtractor: new FakeMetadata(),
    });

    runner.startScan();
    await waitForScan(runner);
    expect(repo.getFileCount()).toBe(2);

    fs.deleteFile("/music/b.wav");
    runner.startScan();
    await waitForScan(runner);

    expect(repo.getFileCount()).toBe(1);
    expect(runner.getStatus().removed).toBe(1);
  });

  it("saveLibraryRoot delegates to settings", () => {
    const sqlite = createTestDb();
    const repo = new SqliteAudioFileRepository(sqlite);
    const settings = new SqliteSettingsRepository(sqlite);
    const runner = new ScanRunner({
      fileRepo: repo, settingsRepo: settings,
      getLibraryRoots: () => ["/music"],
      fs: new FakeFileSystem(),
      metadataExtractor: new FakeMetadata(),
    });

    runner.saveLibraryRoot("/new/root");
    expect(settings.getLibraryRoot()).toBe("/new/root");
  });

  it("validateLibraryRoot returns valid for existing dir", async () => {
    const sqlite = createTestDb();
    const repo = new SqliteAudioFileRepository(sqlite);
    const settings = new SqliteSettingsRepository(sqlite);
    const runner = new ScanRunner({
      fileRepo: repo, settingsRepo: settings,
      getLibraryRoots: () => ["/music"],
      fs: new FakeFileSystem(),
      metadataExtractor: new FakeMetadata(),
    });

    const result = await runner.validateLibraryRoot("/music");
    expect(result.valid).toBe(true);
  });
});
