import fs from "node:fs";
import path from "node:path";

import type { YardExtensionContext } from "yard-core";

import type { JanitorIssue, JanitorReport, JanitorScanOptions } from "./types";

export function createService(context: YardExtensionContext) {
  return new FolderJanitorService(context);
}

export class FolderJanitorService {
  constructor(private context: YardExtensionContext) {}

  async scan(options: JanitorScanOptions): Promise<JanitorReport> {
    this.context.permissions.require("library:read");
    this.context.permissions.require("files:read");

    const allowedFormats = new Set(
      (options.allowedFormats ?? ["wav", "aif", "aiff", "mp3", "flac", "ogg", "m4a", "aac"])
        .map((format) => format.toLowerCase().replace(/^\./, "")),
    );
    const tinyThreshold = options.tinyFileThresholdBytes ?? 1024;
    const issues: JanitorIssue[] = [];
    const duplicateBuckets = new Map<string, typeof options.files>();

    for (const file of options.files) {
      if (!fs.existsSync(file.path)) {
        issues.push({
          kind: "missing-file",
          path: file.path,
          fileIds: [file.id],
          message: "Indexed file is missing on disk.",
        });
        continue;
      }

      const stats = await fs.promises.stat(file.path);
      if (!stats.isFile()) {
        issues.push({
          kind: "broken",
          path: file.path,
          fileIds: [file.id],
          message: "Indexed path is not a normal file.",
        });
        continue;
      }

      if (stats.size === 0) {
        issues.push({
          kind: "broken",
          path: file.path,
          fileIds: [file.id],
          message: "Audio file is empty.",
        });
      } else if (stats.size < tinyThreshold) {
        issues.push({
          kind: "tiny-file",
          path: file.path,
          fileIds: [file.id],
          message: `File is smaller than ${tinyThreshold} bytes.`,
        });
      }

      const extension = path.extname(file.filename).slice(1).toLowerCase();
      const format = (file.format ?? extension).toLowerCase();
      if (format && !allowedFormats.has(format)) {
        issues.push({
          kind: "weird-format",
          path: file.path,
          fileIds: [file.id],
          message: `Unusual audio format: ${format}.`,
        });
      }

      const duplicateKey = `${file.filename.toLowerCase()}::${stats.size}`;
      const bucket = duplicateBuckets.get(duplicateKey) ?? [];
      bucket.push(file);
      duplicateBuckets.set(duplicateKey, bucket);
    }

    for (const bucket of duplicateBuckets.values()) {
      if (bucket.length > 1) {
        issues.push({
          kind: "duplicate",
          path: bucket[0].path,
          fileIds: bucket.map((file) => file.id),
          message: `${bucket.length} files share the same name and size.`,
        });
      }
    }

    for (const root of options.libraryRoots) {
      for (const emptyFolder of await findEmptyFolders(root)) {
        issues.push({
          kind: "empty-folder",
          path: emptyFolder,
          fileIds: [],
          message: "Folder contains no files or non-empty folders.",
        });
      }
    }

    return {
      ok: true,
      scannedFiles: options.files.length,
      scannedRoots: options.libraryRoots.map((root) => path.resolve(root)),
      issues,
    };
  }
}

async function findEmptyFolders(root: string): Promise<string[]> {
  if (!fs.existsSync(root)) {
    return [];
  }

  const emptyFolders: string[] = [];

  async function visit(directory: string): Promise<boolean> {
    const entries = await fs.promises.readdir(directory, { withFileTypes: true });
    let hasContent = false;

    for (const entry of entries) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        const childEmpty = await visit(entryPath);
        if (!childEmpty) {
          hasContent = true;
        }
      } else {
        hasContent = true;
      }
    }

    if (!hasContent) {
      emptyFolders.push(directory);
      return true;
    }

    return false;
  }

  await visit(path.resolve(root));
  return emptyFolders;
}
