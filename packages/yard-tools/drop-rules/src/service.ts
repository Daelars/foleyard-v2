import fs from "node:fs";
import path from "node:path";

import type { YardExtensionContext } from "yard-core";

import type {
  DropRuleAction,
  DropRuleOptions,
  DropRulesFile,
  DropRulesResult,
  PrepareDragOptions,
  PreparedDragResult,
} from "./types";

export function createService(context: YardExtensionContext) {
  return new DropRulesService(context);
}

export class DropRulesService {
  constructor(private context: YardExtensionContext) {}

  preview(options: DropRuleOptions): DropRulesResult {
    this.context.permissions.require("library:read");
    this.context.permissions.require("files:read");
    this.context.permissions.require("drop:read");

    return this.buildResult(options, false);
  }

  async apply(options: DropRuleOptions): Promise<DropRulesResult> {
    this.context.permissions.require("library:read");
    this.context.permissions.require("files:read");
    this.context.permissions.require("files:copy");
    this.context.permissions.require("files:write");
    this.context.permissions.require("drop:modify");

    const result = this.buildResult(options, true);
    await fs.promises.mkdir(result.targetDirectory, { recursive: true });

    for (const action of result.actions) {
      if (action.copied) {
        await fs.promises.copyFile(action.sourcePath, action.outputPath);
      }
    }

    if (result.usedReportPath) {
      await this.writeUsedReport(
        result.targetDirectory,
        result.actions.map((action) => ({
          fileId: action.fileId,
          sourcePath: action.sourcePath,
          outputPath: action.outputPath,
        })),
      );
    }

    return result;
  }

  async prepareDrag(options: PrepareDragOptions): Promise<PreparedDragResult> {
    this.context.permissions.require("library:read");
    this.context.permissions.require("files:read");
    this.context.permissions.require("files:copy");
    this.context.permissions.require("files:write");
    this.context.permissions.require("drop:modify");

    if (!fs.existsSync(options.file.path)) {
      throw new Error(`${options.file.filename} does not exist on disk.`);
    }

    const stagingDirectory = path.resolve(options.stagingDirectory);
    const renameOnDrop = options.renameOnDrop ?? true;
    const copyOnDrop = options.copyOnDrop ?? true;
    const markUsed = options.markUsed ?? true;
    const outputName = renameOnDrop
      ? makeOutputName(
          options.file,
          options.renamePattern ?? "{index}-{name}{ext}",
          1,
          new Set<string>(),
          stagingDirectory,
        )
      : path.basename(options.file.path);

    let dragPath = options.file.path;
    let staged = false;

    if (copyOnDrop || outputName !== path.basename(options.file.path)) {
      await fs.promises.mkdir(stagingDirectory, { recursive: true });
      dragPath = path.join(stagingDirectory, outputName);
      await fs.promises.copyFile(options.file.path, dragPath);
      staged = true;
    }

    const usedReportPath = markUsed
      ? await this.writeUsedReport(stagingDirectory, [
          {
            fileId: options.file.id,
            sourcePath: options.file.path,
            outputPath: dragPath,
          },
        ])
      : null;

    return {
      ok: true,
      fileId: options.file.id,
      originalPath: options.file.path,
      dragPath,
      outputName,
      staged,
      usedReportPath,
    };
  }

  private buildResult(options: DropRuleOptions, applying: boolean): DropRulesResult {
    const targetDirectory = path.resolve(options.targetDirectory);
    const warnings: string[] = [];
    const usedNames = new Set<string>();
    const copyOnDrop = options.copyOnDrop ?? true;
    const renameOnDrop = options.renameOnDrop ?? true;
    const markUsed = options.markUsed ?? true;
    const actions: DropRuleAction[] = [];

    for (let index = 0; index < options.files.length; index += 1) {
      const file = options.files[index];
      if (!fs.existsSync(file.path)) {
        warnings.push(`${file.filename} does not exist on disk.`);
        continue;
      }

      const outputName = renameOnDrop
        ? makeOutputName(
            file,
            options.renamePattern ?? "{index}-{name}{ext}",
            index + 1,
            usedNames,
            targetDirectory,
          )
        : makeUniqueFilename(path.basename(file.path), usedNames, targetDirectory);
      usedNames.add(outputName);

      const shouldPrepareFile = copyOnDrop || outputName !== path.basename(file.path);

      actions.push({
        fileId: file.id,
        sourcePath: file.path,
        outputName,
        outputPath: path.join(targetDirectory, outputName),
        copied: shouldPrepareFile && applying,
      });
    }

    return {
      ok: true,
      targetDirectory,
      actions,
      usedReportPath: markUsed ? path.join(targetDirectory, "foleyard-used.json") : null,
      warnings,
    };
  }

  private async writeUsedReport(
    directory: string,
    files: Array<{
      fileId: string;
      sourcePath: string;
      outputPath: string;
    }>,
  ) {
    await fs.promises.mkdir(directory, { recursive: true });
    const reportPath = path.join(directory, "foleyard-used.json");
    let existingFiles: typeof files = [];

    if (fs.existsSync(reportPath)) {
      try {
        const existing = JSON.parse(
          await fs.promises.readFile(reportPath, "utf8"),
        ) as {
          files?: typeof files;
        };
        existingFiles = Array.isArray(existing.files) ? existing.files : [];
      } catch {
        existingFiles = [];
      }
    }

    await fs.promises.writeFile(
      reportPath,
      JSON.stringify(
        {
          updatedAt: new Date().toISOString(),
          files: [...existingFiles, ...files],
        },
        null,
        2,
      ),
    );

    return reportPath;
  }
}

function makeOutputName(
  file: DropRulesFile,
  pattern: string,
  index: number,
  usedNames: Set<string>,
  targetDirectory: string,
) {
  const parsed = path.parse(path.basename(file.filename));
  const paddedIndex = String(index).padStart(3, "0");
  const now = new Date();
  const date = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
  const time = [
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
    String(now.getSeconds()).padStart(2, "0"),
  ].join("-");
  const base = pattern
    .replaceAll("{index}", paddedIndex)
    .replaceAll("{name}", parsed.name)
    .replaceAll("{ext}", parsed.ext)
    .replaceAll(
      "{format}",
      (file.format ?? parsed.ext.replace(/^\./, "")).toLowerCase(),
    )
    .replaceAll("{date}", date)
    .replaceAll("{time}", time);
  const clean = path.basename(base).replace(/[<>:"/\\|?*\x00-\x1f]/g, "-");

  return makeUniqueFilename(
    clean || `${paddedIndex}-${parsed.name}${parsed.ext}`,
    usedNames,
    targetDirectory,
  );
}

function makeUniqueFilename(
  filename: string,
  usedNames: Set<string>,
  targetDirectory: string,
) {
  const parsed = path.parse(filename);
  let candidate = filename;
  let duplicateIndex = 2;

  while (
    usedNames.has(candidate) ||
    fs.existsSync(path.join(targetDirectory, candidate))
  ) {
    candidate = `${parsed.name} ${duplicateIndex}${parsed.ext}`;
    duplicateIndex += 1;
  }

  return candidate;
}
