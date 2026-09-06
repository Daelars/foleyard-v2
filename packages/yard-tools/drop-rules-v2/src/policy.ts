import { makeUniqueFilename, sanitizeFilename } from "yard-core";

/**
 * Pure drop-rule policy for Drop Rules v2 (Yard Tools context, D6 #181).
 *
 * No services, no filesystem, no v1 imports: rename-pattern expansion
 * (`{name}`, `{index}`, `{ext}`, `{format}`, `{date}`, `{time}`),
 * in-run unique-name planning, and the drop-size bound. The handlers
 * feed these from the v2 operation services; destination collisions
 * are detected at copy time (the copy op fails with a reason instead
 * of overwriting).
 */

/** Largest number of dropped sounds one preview/apply plans. */
export const MAX_DROP_FILES = 100;

export const DEFAULT_RENAME_PATTERN = "{index}-{name}{ext}";

export type DropRuleSettings = {
  copyOnDrop: boolean;
  renameOnDrop: boolean;
  renamePattern: string;
  markUsed: boolean;
};

export type PlannedDropFile = {
  fileId: string;
  sourcePath: string;
  filename: string;
  outputName: string;
};

function padIndex(index: number): string {
  return String(index).padStart(3, "0");
}

function splitName(filename: string): [string, string] {
  const dot = filename.lastIndexOf(".");
  if (dot <= 0) return [filename, ""];
  return [filename.slice(0, dot), filename.slice(dot)];
}

/**
 * Expand a rename pattern for one file. Unknown tokens pass through
 * verbatim so a typo is visible in the planned name instead of
 * silently vanishing.
 */
export function expandRenamePattern(
  filename: string,
  format: string | null,
  pattern: string,
  index: number,
  now: Date = new Date(),
): string {
  const [stem, ext] = splitName(filename);
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
  const expanded = pattern
    .replaceAll("{index}", padIndex(index))
    .replaceAll("{name}", stem)
    .replaceAll("{ext}", ext)
    .replaceAll("{format}", (format ?? ext.replace(/^\./, "")).toLowerCase())
    .replaceAll("{date}", date)
    .replaceAll("{time}", time);
  const clean = sanitizeFilename(expanded);
  return clean || `${padIndex(index)}-${stem}${ext}`;
}

/**
 * Plan output names for dropped files: rename (or keep the Library
 * filename verbatim when renaming is off), deduplicated
 * case-insensitively within the run (`name.ext`, `name 2.ext`, …).
 */
export function planDropNames(
  files: Array<{ fileId: string; sourcePath: string; filename: string; format: string | null }>,
  settings: DropRuleSettings,
  now: Date = new Date(),
): PlannedDropFile[] {
  const used = new Set<string>();
  return files.map((file, position) => {
    const base = settings.renameOnDrop
      ? expandRenamePattern(file.filename, file.format, settings.renamePattern, position + 1, now)
      : file.filename;
    const outputName = makeUniqueFilename(used, () => false, base);
    return { fileId: file.fileId, sourcePath: file.sourcePath, filename: file.filename, outputName };
  });
}
