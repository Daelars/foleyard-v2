import fs from "fs/promises";
import path from "path";

import { isSupportedAudioFile } from "@yard-core";

const DEFAULT_DISCOVERY_BATCH_SIZE = 500;

export async function existsReadableDirectory(dirPath: string) {
  const stat = await fs.stat(dirPath);
  if (!stat.isDirectory()) {
    throw new Error("Path is not a directory");
  }

  await fs.access(dirPath);
}

export async function findFirstAudioFile(rootPath: string) {
  const dirsToProcess: string[] = [rootPath];

  while (dirsToProcess.length > 0) {
    const currentPath = dirsToProcess.pop()!;
    const entries = await fs.readdir(currentPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name);

      if (entry.isDirectory()) {
        dirsToProcess.push(fullPath);
        continue;
      }

      if (entry.isFile() && isSupportedAudioFile(entry.name)) {
        return fullPath;
      }
    }
  }

  return null;
}

export async function* streamAudioFileBatches(
  rootPath: string,
  options?: {
    batchSize?: number;
    onDiscover?: (filePath: string) => void;
  },
) {
  const batchSize = options?.batchSize ?? DEFAULT_DISCOVERY_BATCH_SIZE;
  const onDiscover = options?.onDiscover;
  const dirsToProcess: string[] = [rootPath];
  let currentBatch: string[] = [];

  while (dirsToProcess.length > 0) {
    const currentPath = dirsToProcess.pop()!;
    const entries = await fs.readdir(currentPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name);

      if (entry.isDirectory()) {
        dirsToProcess.push(fullPath);
        continue;
      }

      if (!entry.isFile() || !isSupportedAudioFile(entry.name)) {
        continue;
      }

      currentBatch.push(fullPath);
      onDiscover?.(fullPath);

      if (currentBatch.length >= batchSize) {
        yield currentBatch;
        currentBatch = [];
      }
    }
  }

  if (currentBatch.length > 0) {
    yield currentBatch;
  }
}

import type { FileSystemSeam } from "./scan-runner";

export class RealFileSystemSeam implements FileSystemSeam {
  async stat(filePath: string) {
    const stats = await fs.stat(filePath);
    return { size: stats.size, mtimeMs: stats.mtimeMs };
  }

  existsReadableDirectory(dirPath: string) {
    return existsReadableDirectory(dirPath);
  }

  findFirstAudioFile(rootPath: string) {
    return findFirstAudioFile(rootPath);
  }

  streamAudioFileBatches(
    rootPath: string,
    options?: {
      batchSize?: number;
      onDiscover?: (filePath: string) => void;
    },
  ) {
    return streamAudioFileBatches(rootPath, options);
  }
}

export async function collectAudioFiles(
  rootPath: string,
  onDiscover?: (filePath: string) => void,
) {
  const found: string[] = [];

  for await (const batch of streamAudioFileBatches(rootPath, { onDiscover })) {
    found.push(...batch);
  }

  return found;
}
