import { makeUniqueFilename, sanitizeFilename } from "yard-core";

import type { MakePackV2Format, MakePackV2Source } from "./definition";

/**
 * Pure export-policy helpers for Make Pack v2 (Yard Tools context, R8).
 *
 * No services, no filesystem, no v1 imports: name planning,
 * collision reservation, manifest shaping, and option validation.
 * The handlers enforce these through v2 operation services; the
 * tests assert them without touching disk.
 */

/** Largest pack the export path accepts (mirrors the archive service bound). */
export const MAX_PACK_FILES = 500;

/** Reserved output name: a source colliding with it is renamed, never overwritten. */
export const MANIFEST_NAME = "manifest.json";

/** Longest accepted pack name, in characters (matches v1 behavior). */
export const MAX_PACK_NAME_LENGTH = 80;

export type PlannedPackOptions = {
  packName: string;
  outputFormat: MakePackV2Format;
  includeManifest: boolean;
  grantId: string | null;
};

export type PlannedPackFile = {
  fileId: string;
  filename: string;
  outputName: string;
  renamed: boolean;
};

export type PlannedPackNames = {
  files: PlannedPackFile[];
  /** Human-readable notes for the preview (renames, reservations). */
  notices: string[];
};

/** Per-source default pack name (matches the v1 dialog defaults). */
export function defaultPackName(source: MakePackV2Source): string {
  if (source === "selection") return "Selected Sounds Pack";
  if (source === "shelf") return "Shelf Pack";
  return "Recent Sounds Pack";
}

/** Trim, sanitize OS-invalid characters, and bound the length. */
export function sanitizePackName(raw: string | undefined, source: MakePackV2Source): string {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return defaultPackName(source);
  const clean = sanitizeFilename(trimmed).slice(0, MAX_PACK_NAME_LENGTH).trim();
  return clean || defaultPackName(source);
}

export function dedupeIds(ids: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/**
 * Plan folder output names: sanitize OS-invalid characters, reserve
 * `manifest.json` (case-insensitive) when a manifest is written, and
 * dedupe case-insensitively in `name 2.ext` style. Never returns an
 * empty name; falls back to `sound` like v1.
 */
export function planFolderNames(
  files: Array<{ fileId: string; filename: string }>,
  includeManifest: boolean,
): PlannedPackNames {
  const planned = new Set<string>();
  if (includeManifest) planned.add(MANIFEST_NAME.toLowerCase());
  const out: PlannedPackFile[] = [];
  const notices: string[] = [];
  for (const file of files) {
    const base = sanitizeFilename(file.filename.trim() || "sound") || "sound";
    const outputName = makeUniqueFilename(planned, () => false, base);
    const renamed = outputName.toLowerCase() !== base.toLowerCase();
    if (renamed) {
      notices.push(`"${file.filename}" packs as "${outputName}" to avoid a collision.`);
    }
    out.push({ fileId: file.fileId, filename: file.filename, outputName, renamed });
  }
  return { files: out, notices };
}

export type ZipNameConflict =
  | { kind: "entry-collision"; names: string[] }
  | { kind: "manifest-collision"; name: string };

/**
 * ZIP entry names are Library filenames verbatim (core-owned archive
 * behavior): detect case-insensitive entry collisions and
 * `manifest.json` reservation conflicts before archiving so the
 * preview blocks with guidance instead of failing mid-write.
 */
export function detectZipConflicts(
  filenames: readonly string[],
  includeManifest: boolean,
): ZipNameConflict[] {
  const seen = new Map<string, string>();
  const conflicts: ZipNameConflict[] = [];
  for (const filename of filenames) {
    const key = filename.toLowerCase();
    const first = seen.get(key);
    if (first !== undefined && first !== filename) {
      conflicts.push({ kind: "entry-collision", names: [first, filename] });
    } else if (first === undefined) {
      seen.set(key, filename);
    }
  }
  if (includeManifest && seen.has(MANIFEST_NAME.toLowerCase())) {
    conflicts.push({ kind: "manifest-collision", name: MANIFEST_NAME });
  }
  return conflicts;
}

export type ManifestFileEntry = {
  id: string;
  filename: string;
  outputName: string;
  format: string | null;
  duration: number | null;
  fileSize: number | null;
};

export function buildManifestText(input: {
  packName: string;
  source: MakePackV2Source;
  outputFormat: MakePackV2Format;
  createdAt: string;
  files: ManifestFileEntry[];
  skipped: string[];
  missing: string[];
}): string {
  return JSON.stringify(
    {
      name: input.packName,
      source: input.source,
      outputFormat: input.outputFormat,
      createdAt: input.createdAt,
      files: input.files,
      skipped: input.skipped,
      missing: input.missing,
    },
    null,
    2,
  );
}

/** Normalize raw command input against settings defaults. Throws on mistyped values. */
export function resolvePackOptions(input: {
  raw: unknown;
  settings: { packName: string; defaultFormat: unknown; includeManifest: unknown };
  source: MakePackV2Source;
}): PlannedPackOptions {
  const candidate =
    typeof input.raw === "object" && input.raw !== null
      ? (input.raw as Record<string, unknown>)
      : {};
  const rawFormat = candidate.outputFormat ?? input.settings.defaultFormat;
  if (rawFormat !== "folder" && rawFormat !== "zip") {
    throw new Error(
      `Output format must be "folder" or "zip"; got ${JSON.stringify(rawFormat)}.`,
    );
  }
  const rawManifest = candidate.includeManifest ?? input.settings.includeManifest;
  if (typeof rawManifest !== "boolean") {
    throw new Error(
      `Include-manifest must be a boolean; got ${JSON.stringify(rawManifest)}.`,
    );
  }
  const rawName = candidate.packName;
  if (rawName !== undefined && typeof rawName !== "string") {
    throw new Error("Pack name must be a string.");
  }
  const rawGrant = candidate.grantId;
  if (rawGrant !== undefined && (typeof rawGrant !== "string" || !rawGrant.trim())) {
    throw new Error("Destination grant must be a non-empty string.");
  }
  return {
    packName: sanitizePackName(
      typeof rawName === "string" && rawName.trim()
        ? rawName
        : input.settings.packName,
      input.source,
    ),
    outputFormat: rawFormat,
    includeManifest: rawManifest,
    grantId: typeof rawGrant === "string" ? rawGrant : null,
  };
}

/** Common parent directory of copied outputs (the destination grant root). */
export function commonParentDir(paths: readonly string[]): string {
  if (paths.length === 0) return "";
  const first = paths[0]!;
  const sep = first.includes("\\") ? "\\" : "/";
  const parent = (path: string): string => {
    const index = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
    return index === -1 ? "" : path.slice(0, index);
  };
  let common = parent(first);
  for (const path of paths.slice(1)) {
    const dir = parent(path);
    while (dir && !(common === dir || dir.startsWith(`${common}${sep}`))) {
      common = parent(common);
    }
  }
  return common;
}
