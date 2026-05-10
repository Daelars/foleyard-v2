import fs from "node:fs";
import path from "node:path";

import type { YardExtensionContext } from "yard-core";

import type {
  MakePackFile,
  MakePackItem,
  MakePackOptions,
  MakePackResult,
} from "./types";
import { writeStoredZip } from "./zip";

export function createService(context: YardExtensionContext) {
  return new MakePackService(context);
}

export class MakePackService {
  constructor(private context: YardExtensionContext) {}

  async createPack(options: MakePackOptions): Promise<MakePackResult> {
    this.context.permissions.require("library:read");
    this.context.permissions.require("files:read");
    this.context.permissions.require("files:copy");
    this.context.permissions.require("files:write");

    const files = this.dedupeFiles(options.files);
    if (files.length === 0) {
      throw new Error("No sounds were provided for the pack.");
    }

    const outputFormat = options.outputFormat ?? "folder";
    const packName = sanitizePackName(options.packName) ?? defaultPackName();
    const destinationDirectory = path.resolve(options.destinationDirectory);
    const packDirectory = path.join(destinationDirectory, packName);
    const skipped: string[] = [];
    const items: MakePackItem[] = [];

    await fs.promises.mkdir(destinationDirectory, { recursive: true });

    const outputPath =
      outputFormat === "zip" ? `${packDirectory}.zip` : packDirectory;

    if (fs.existsSync(outputPath)) {
      throw new Error(`Pack output already exists: ${outputPath}`);
    }

    const outputNames = new Set<string>();

    for (const file of files) {
      if (!fs.existsSync(file.path)) {
        skipped.push(file.filename);
        continue;
      }

      const stats = await fs.promises.stat(file.path);
      if (!stats.isFile()) {
        skipped.push(file.filename);
        continue;
      }

      const outputName = makeUniqueFilename(file.filename, outputNames);
      outputNames.add(outputName);
      items.push({
        fileId: file.id,
        filename: file.filename,
        outputName,
        sourcePath: file.path,
        size: stats.size,
      });
    }

    if (items.length === 0) {
      throw new Error("None of the requested sounds exist on disk.");
    }

    const includeManifest = options.includeManifest ?? true;
    const manifestEntry = includeManifest
      ? {
          archiveName: "manifest.json",
          content: JSON.stringify(
            {
              name: packName,
              source: options.source,
              createdAt: new Date().toISOString(),
              files: items.map((item) => {
                const file = files.find((candidate) => candidate.id === item.fileId);
                return {
                  id: item.fileId,
                  filename: item.filename,
                  outputName: item.outputName,
                  format: file?.format ?? null,
                  duration: file?.duration ?? null,
                  fileSize: file?.fileSize ?? item.size,
                };
              }),
              skipped,
            },
            null,
            2,
          ),
        }
      : null;

    if (outputFormat === "zip") {
      const tempManifestPath = manifestEntry
        ? path.join(destinationDirectory, `.${packName}-manifest.tmp.json`)
        : null;

      try {
        if (manifestEntry && tempManifestPath) {
          await fs.promises.writeFile(tempManifestPath, manifestEntry.content);
        }

        await writeStoredZip(outputPath, [
          ...items.map((item) => ({
            sourcePath: item.sourcePath,
            archiveName: item.outputName,
          })),
          ...(manifestEntry && tempManifestPath
            ? [{ sourcePath: tempManifestPath, archiveName: manifestEntry.archiveName }]
            : []),
        ]);
      } finally {
        if (tempManifestPath) {
          await fs.promises.rm(tempManifestPath, { force: true });
        }
      }
    } else {
      await fs.promises.mkdir(packDirectory, { recursive: false });
      for (const item of items) {
        await fs.promises.copyFile(
          item.sourcePath,
          path.join(packDirectory, item.outputName),
        );
      }
      if (manifestEntry) {
        await fs.promises.writeFile(
          path.join(packDirectory, manifestEntry.archiveName),
          manifestEntry.content,
        );
      }
    }

    return {
      ok: true,
      source: options.source,
      outputFormat,
      packName,
      outputPath,
      fileCount: items.length,
      skipped,
      items,
    };
  }

  private dedupeFiles(files: MakePackFile[]) {
    const seen = new Set<string>();
    const deduped: MakePackFile[] = [];

    for (const file of files) {
      if (seen.has(file.id)) {
        continue;
      }
      seen.add(file.id);
      deduped.push(file);
    }

    return deduped;
  }
}

function defaultPackName() {
  const now = new Date();
  const stamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
  ].join("-");

  return `Foleyard Pack ${stamp}`;
}

function sanitizePackName(packName: string | undefined) {
  const trimmed = packName?.trim();
  if (!trimmed) {
    return null;
  }

  return trimmed.replace(/[<>:"/\\|?*\x00-\x1f]/g, "-").slice(0, 80).trim();
}

function makeUniqueFilename(filename: string, usedNames: Set<string>) {
  const cleanName = path.basename(filename).replace(/[<>:"/\\|?*\x00-\x1f]/g, "-");
  const parsed = path.parse(cleanName);
  let candidate = cleanName || "sound";
  let index = 2;

  while (usedNames.has(candidate)) {
    candidate = `${parsed.name || "sound"} ${index}${parsed.ext}`;
    index += 1;
  }

  return candidate;
}
