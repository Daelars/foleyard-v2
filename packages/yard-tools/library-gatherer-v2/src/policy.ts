/**
 * Pure gather-policy helpers for Library Gatherer v2 (Yard Tools
 * context, G5 #180).
 *
 * No services, no filesystem, no v1 imports: audio-extension matching,
 * flat output-name planning with folder-name prefixing and
 * case-insensitive dedupe, and the parallel-array result shape. The
 * handlers feed these from the v2 operation services.
 */

/** Default audio extensions considered gatherable (matches v1, dotless). */
export const DEFAULT_AUDIO_EXTENSIONS = [
  "wav",
  "aif",
  "aiff",
  "mp3",
  "flac",
  "ogg",
  "m4a",
  "aac",
];

/** Largest number of files one gather copies/inserts (mutation limit). */
export const MAX_GATHER_FILES = 500;

/** Largest number of directory listings one source walk performs. */
export const MAX_SOURCE_LISTINGS = 5_000;

export function audioExtensionSet(extensions?: readonly string[]): Set<string> {
  const source = extensions && extensions.length > 0 ? extensions : DEFAULT_AUDIO_EXTENSIONS;
  return new Set(source.map((ext) => ext.trim().toLowerCase().replace(/^\./, "")).filter(Boolean));
}

export function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf(".");
  if (dot <= 0 || dot === filename.length - 1) return "";
  return filename.slice(dot + 1).toLowerCase();
}

export function isAudioFile(filename: string, allowed: Set<string>): boolean {
  return allowed.has(extensionOf(filename));
}

/** Split a filename into stem + dotted extension (e.g. "a.wav" → ["a", ".wav"]). */
export function splitName(filename: string): [string, string] {
  const dot = filename.lastIndexOf(".");
  if (dot <= 0) return [filename, ""];
  return [filename.slice(0, dot), filename.slice(dot)];
}

/** Basename of a canonical path (forward or back slashes). */
export function baseName(path: string): string {
  const trimmed = path.replace(/[\\/]+$/, "");
  const slash = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
  return slash === -1 ? trimmed : trimmed.slice(slash + 1);
}

/**
 * The flat output name for a gathered file. `preserveFolderNames`
 * prefixes the source folder name (v2 gathers into one flat destination
 * folder — the copy op forbids path separators — so grouping shows up
 * in the name, not a subfolder).
 */
export function plannedOutputName(
  filename: string,
  sourceFolderName: string,
  preserveFolderNames: boolean,
): string {
  if (!preserveFolderNames || !sourceFolderName.trim()) return filename;
  return `${sourceFolderName} - ${filename}`;
}

/**
 * Reserve a unique output name (case-insensitive) against already-planned
 * names: `name.ext`, then `name 2.ext`, `name 3.ext`, …. Mutates `used`.
 */
export function reserveUniqueName(used: Set<string>, name: string): string {
  if (!used.has(name.toLowerCase())) {
    used.add(name.toLowerCase());
    return name;
  }
  const [stem, ext] = splitName(name);
  let counter = 2;
  let candidate = `${stem} ${counter}${ext}`;
  while (used.has(candidate.toLowerCase())) {
    counter += 1;
    candidate = `${stem} ${counter}${ext}`;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

export type PlannedGatherFile = {
  sourceGrantId: string;
  sourcePath: string;
  outputName: string;
  size: number;
};
