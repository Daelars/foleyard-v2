/**
 * Archive artifact locator (Application context, dev tooling).
 *
 * Audit reports, plans and HTML explainers live in a separate
 * `foleyard-archive` checkout, never in this repository. The development
 * viewer reads them from `FOLEYARD_ARCHIVE_DIR` when set, otherwise from
 * the sibling checkout next to this workspace. Production never reaches
 * this module: only `src/app/prototype/archive/**` imports it, and the
 * prototype layout resolves to not-found in packaged builds.
 */

import fs from "node:fs";
import path from "node:path";

export type ArchiveEntryKind = "html" | "markdown" | "image";

export type ArchiveEntry = {
  /** POSIX path relative to the archive root. */
  path: string;
  title: string;
  group: string;
  kind: ArchiveEntryKind;
  bytes: number;
};

export type ArchiveRoot = {
  root: string;
  source: "env" | "sibling";
};

const ALLOWED_EXTENSIONS: Record<string, ArchiveEntryKind> = {
  ".html": "html",
  ".htm": "html",
  ".md": "markdown",
  ".png": "image",
  ".jpg": "image",
  ".jpeg": "image",
  ".webp": "image",
  ".gif": "image",
  ".svg": "image",
};

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
};

const SKIP_DIRECTORIES = new Set([".git", ".next", ".research", "node_modules"]);

const MAX_DEPTH = 6;
const MAX_ENTRIES = 500;

// Audits and plans are the reason the viewer exists; keep them at the top
// instead of letting the much larger blog-post group bury them.
const GROUP_PRIORITY = ["docs/audits", "docs/audit-2026-09", "docs/plans"];

function groupRank(group: string): number {
  const index = GROUP_PRIORITY.indexOf(group);
  if (index !== -1) return index;
  if (group.startsWith("prototypes")) return GROUP_PRIORITY.length;
  return GROUP_PRIORITY.length + 1;
}

function resolveAppRoot(): string {
  let dir = __dirname;
  for (let i = 0; i < 6; i++) {
    const manifest = path.join(dir, "package.json");
    if (fs.existsSync(manifest) && fs.existsSync(path.join(dir, "docs"))) {
      try {
        const pkg = JSON.parse(fs.readFileSync(manifest, "utf8")) as { name?: string };
        if (pkg.name === "foleyard") return dir;
      } catch {
        // Keep walking; a malformed package.json is not this module's problem.
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

export function resolveArchiveRoot(): ArchiveRoot | null {
  const fromEnv = process.env.FOLEYARD_ARCHIVE_DIR;
  if (fromEnv && fs.existsSync(fromEnv)) {
    return { root: path.resolve(fromEnv), source: "env" };
  }
  const sibling = path.resolve(resolveAppRoot(), "..", "foleyard-archive");
  if (fs.existsSync(sibling)) return { root: sibling, source: "sibling" };
  return null;
}

function groupFor(relativePath: string): string {
  const parts = relativePath.split("/");
  if (parts[0] === "docs" && parts.length > 2) return `docs/${parts[1]}`;
  if (parts[0] === "prototypes" && parts.length > 2) return `prototypes/${parts[1]}`;
  return parts[0];
}

function titleFor(relativePath: string): string {
  const parts = relativePath.split("/");
  const file = parts[parts.length - 1];
  const stem = file.replace(/\.[^.]+$/, "");
  if (stem === "index" && parts.length > 1) return parts[parts.length - 2];
  return stem.replace(/[-_]+/g, " ");
}

function walk(root: string, relativeDir: string, depth: number, found: ArchiveEntry[]): void {
  if (depth > MAX_DEPTH || found.length >= MAX_ENTRIES) return;
  const absoluteDir = relativeDir ? path.join(root, relativeDir) : root;
  let dirents: fs.Dirent[];
  try {
    dirents = fs.readdirSync(absoluteDir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const dirent of dirents) {
    if (found.length >= MAX_ENTRIES) return;
    if (dirent.name.startsWith(".")) continue;
    const relativePath = relativeDir ? `${relativeDir}/${dirent.name}` : dirent.name;
    if (dirent.isDirectory()) {
      if (SKIP_DIRECTORIES.has(dirent.name)) continue;
      walk(root, relativePath, depth + 1, found);
      continue;
    }
    if (!dirent.isFile()) continue;
    const extension = path.extname(dirent.name).toLowerCase();
    const kind = ALLOWED_EXTENSIONS[extension];
    if (!kind) continue;
    let bytes = 0;
    try {
      bytes = fs.statSync(path.join(root, relativePath)).size;
    } catch {
      continue;
    }
    found.push({ path: relativePath, title: titleFor(relativePath), group: groupFor(relativePath), kind, bytes });
  }
}

export function listArchiveArtifacts(): ArchiveEntry[] {
  const resolved = resolveArchiveRoot();
  if (!resolved) return [];
  const found: ArchiveEntry[] = [];
  walk(resolved.root, "", 0, found);
  return found.sort(
    (a, b) =>
      groupRank(a.group) - groupRank(b.group) ||
      a.group.localeCompare(b.group) ||
      a.title.localeCompare(b.title) ||
      a.path.localeCompare(b.path),
  );
}

function isSafeRelativePath(relativePath: string): boolean {
  if (!relativePath || relativePath.includes("\\") || relativePath.startsWith("/")) return false;
  return relativePath
    .split("/")
    .every((segment) => segment.length > 0 && segment !== ".." && !segment.startsWith("."));
}

export function readArchiveFile(
  relativePath: string,
): { content: Buffer; contentType: string } | null {
  if (!isSafeRelativePath(relativePath)) return null;
  const resolved = resolveArchiveRoot();
  if (!resolved) return null;
  const extension = path.extname(relativePath).toLowerCase();
  const contentType = CONTENT_TYPES[extension];
  if (!contentType) return null;
  const absolute = path.resolve(resolved.root, relativePath);
  if (absolute !== resolved.root && !absolute.startsWith(resolved.root + path.sep)) return null;
  try {
    if (!fs.statSync(absolute).isFile()) return null;
    return { content: fs.readFileSync(absolute), contentType };
  } catch {
    return null;
  }
}
