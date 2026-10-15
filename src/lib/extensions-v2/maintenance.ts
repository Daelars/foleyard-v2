import fs from "node:fs";
import path from "node:path";

import { getLibraryRoots } from "@/lib/db";
import type { V2DirectoryEntry, V2FolderScanPorts, V2PathIo } from "@yard-core";

/**
 * Application folder-scan ports for v2 operations (Application
 * context, E1 #176).
 *
 * Node-backed directory listing and empty-directory removal behind
 * the authorized folder services in core `maintenance.ts`: core
 * authorizes every path (Library roots or readable source grants for
 * listing, Library roots only for deletion) through the filesystem
 * guards, then calls these ports for the bytes. Listing streams the
 * directory and stops at the caller's bound (#315), so a large folder
 * is never read or statted in full. Removal uses a non-recursive delete
 * so a folder that gained contents between the emptiness check and the
 * removal fails instead of deleting data. No v1 extension modules
 * imported.
 */

const nodePathIo: V2PathIo = {
  realpath: (candidate) => fs.promises.realpath(candidate),
  lstat: async (candidate) => {
    try {
      const entry = await fs.promises.lstat(candidate);
      return { exists: true, isLink: entry.isSymbolicLink() };
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        return { exists: false, isLink: false };
      }
      throw error;
    }
  },
};

export type V2FolderScanDeps = {
  libraryRoots?: () => readonly string[] | Promise<readonly string[]>;
  pathIo?: () => V2PathIo;
  listDirectory?: (canonicalPath: string, limit: number) => Promise<V2DirectoryEntry[]>;
  removeEmptyDirectory?: (canonicalPath: string) => Promise<void>;
};

async function toDirectoryEntry(
  canonicalPath: string,
  entry: fs.Dirent,
): Promise<V2DirectoryEntry> {
  const entryPath = path.join(canonicalPath, entry.name);
  if (!entry.isFile()) {
    return { name: entry.name, path: entryPath, kind: "directory", size: null };
  }
  try {
    const stats = await fs.promises.stat(entryPath);
    return {
      name: entry.name,
      path: entryPath,
      kind: stats.isFile() ? "file" : "directory",
      size: stats.isFile() ? stats.size : null,
    };
  } catch {
    return { name: entry.name, path: entryPath, kind: "file", size: null };
  }
}

/**
 * At most `limit` entries of one directory (#315). The directory is read
 * as a stream and abandoned at the bound, so a large folder is never
 * pulled into one array, and only the entries actually returned are
 * statted.
 */
async function listDirectoryEntries(
  canonicalPath: string,
  limit: number,
): Promise<V2DirectoryEntry[]> {
  const entries: V2DirectoryEntry[] = [];
  if (!Number.isFinite(limit) || limit <= 0) return entries;
  const directory = await fs.promises.opendir(canonicalPath);
  // Breaking out of the async iterator closes the handle (its `return`).
  for await (const dirent of directory) {
    entries.push(await toDirectoryEntry(canonicalPath, dirent));
    if (entries.length >= limit) break;
  }
  return entries;
}

/** Node-backed folder ports; pass deps only in tests. */
export function createV2FolderScanPorts(deps: V2FolderScanDeps = {}): V2FolderScanPorts {
  return {
    libraryRoots: deps.libraryRoots ?? (() => getLibraryRoots()),
    pathIo: deps.pathIo ?? (() => nodePathIo),
    listDirectory: deps.listDirectory ?? listDirectoryEntries,
    removeEmptyDirectory: deps.removeEmptyDirectory ??
      (async (canonicalPath) => {
        // Non-recursive: a folder that gained contents since the
        // emptiness check fails here instead of deleting data.
        await fs.promises.rm(canonicalPath, { recursive: false });
      }),
  };
}
