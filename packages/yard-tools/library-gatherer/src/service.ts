import fs from "node:fs";
import path from "node:path";

import type { YardExtensionContext } from "yard-core";

import type { GatherOptions, GatherResult, GatheredFile } from "./types";

const defaultAudioExtensions = [
  ".wav",
  ".aif",
  ".aiff",
  ".mp3",
  ".flac",
  ".ogg",
  ".m4a",
  ".aac",
];

export function createService(context: YardExtensionContext) {
  return new LibraryGathererService(context);
}

export class LibraryGathererService {
  constructor(private context: YardExtensionContext) {}

  async preview(options: GatherOptions): Promise<GatherResult> {
    this.context.permissions.require("library:read");
    this.context.permissions.require("files:read");

    return this.buildResult(options, false);
  }

  async gather(options: GatherOptions): Promise<GatherResult> {
    this.context.permissions.require("library:read");
    this.context.permissions.require("library:write");
    this.context.permissions.require("files:read");
    this.context.permissions.require("files:copy");
    this.context.permissions.require("files:write");

    const result = await this.buildResult(options, true);
    await fs.promises.mkdir(result.destinationDirectory, { recursive: true });

    for (const file of result.files) {
      if (!file.skipped) {
        await fs.promises.mkdir(path.dirname(file.outputPath), { recursive: true });
        await fs.promises.copyFile(file.sourcePath, file.outputPath);
      }
    }

    await fs.promises.writeFile(
      result.reportPath,
      JSON.stringify(
        {
          createdAt: new Date().toISOString(),
          copied: result.copied,
          skipped: result.skipped,
          files: result.files,
        },
        null,
        2,
      ),
    );

    return result;
  }

  private async buildResult(
    options: GatherOptions,
    applying: boolean,
  ): Promise<GatherResult> {
    const destinationDirectory = path.resolve(options.destinationDirectory);
    const preserveFolderNames = options.preserveFolderNames ?? true;
    const skipDuplicates = options.skipDuplicates ?? true;
    const audioExtensions = new Set(
      (options.audioExtensions ?? defaultAudioExtensions).map((extension) =>
        extension.startsWith(".") ? extension.toLowerCase() : `.${extension.toLowerCase()}`,
      ),
    );
    const existingKeys = applying && skipDuplicates
      ? await collectExistingKeys(destinationDirectory, audioExtensions)
      : new Set<string>();
    const plannedNames = new Set<string>();
    const files: GatheredFile[] = [];

    for (const sourceDirectory of options.sourceDirectories) {
      const sourceRoot = path.resolve(sourceDirectory);
      if (!fs.existsSync(sourceRoot)) {
        files.push({
          sourcePath: sourceRoot,
          outputPath: destinationDirectory,
          size: 0,
          skipped: true,
          reason: "Source folder does not exist.",
        });
        continue;
      }

      for (const sourcePath of await findAudioFiles(sourceRoot, audioExtensions)) {
        const stats = await fs.promises.stat(sourcePath);
        const sourceFolderName = path.basename(sourceRoot);
        const relativeName = preserveFolderNames
          ? path.join(sourceFolderName, path.basename(sourcePath))
          : path.basename(sourcePath);
        const outputPath = makeUniqueOutputPath(
          destinationDirectory,
          relativeName,
          plannedNames,
        );
        const duplicateKey = `${path.basename(sourcePath).toLowerCase()}::${stats.size}`;
        const skipped = skipDuplicates && existingKeys.has(duplicateKey);

        files.push({
          sourcePath,
          outputPath,
          size: stats.size,
          skipped,
          reason: skipped ? "Duplicate already exists in destination." : null,
        });
      }
    }

    return {
      ok: true,
      sourceDirectories: options.sourceDirectories.map((source) => path.resolve(source)),
      destinationDirectory,
      copied: files.filter((file) => !file.skipped).length,
      skipped: files.filter((file) => file.skipped).length,
      files,
      reportPath: path.join(destinationDirectory, "foleyard-gather-report.json"),
    };
  }
}

async function findAudioFiles(root: string, audioExtensions: Set<string>) {
  const results: string[] = [];

  async function visit(directory: string) {
    const entries = await fs.promises.readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(entryPath);
      } else if (audioExtensions.has(path.extname(entry.name).toLowerCase())) {
        results.push(entryPath);
      }
    }
  }

  await visit(root);
  return results;
}

async function collectExistingKeys(
  destinationDirectory: string,
  audioExtensions: Set<string>,
) {
  const keys = new Set<string>();
  if (!fs.existsSync(destinationDirectory)) {
    return keys;
  }

  for (const filePath of await findAudioFiles(destinationDirectory, audioExtensions)) {
    const stats = await fs.promises.stat(filePath);
    keys.add(`${path.basename(filePath).toLowerCase()}::${stats.size}`);
  }

  return keys;
}

function makeUniqueOutputPath(
  destinationDirectory: string,
  relativeName: string,
  plannedNames: Set<string>,
) {
  const parsed = path.parse(relativeName);
  let candidate = relativeName;
  let index = 2;

  while (plannedNames.has(candidate.toLowerCase())) {
    candidate = path.join(parsed.dir, `${parsed.name} ${index}${parsed.ext}`);
    index += 1;
  }

  plannedNames.add(candidate.toLowerCase());
  return path.join(destinationDirectory, candidate);
}
