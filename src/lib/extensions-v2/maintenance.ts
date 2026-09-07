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
 * guards, then calls these ports for the bytes. Removal uses a
 * non-recursive delete so a folder that gained contents between the
 * emptiness check and the removal fails instead of deleting data.
 * No v1 extension modules imported.
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
  listDirectory?: (canonicalPath: string) => Promise<V2DirectoryEntry[]>;
  removeEmptyDirectory?: (canonicalPath: string) => Promise<void>;
};

async function listDirectoryEntries(canonicalPath: string): Promise<V2DirectoryEntry[]> {
  const names = await fs.promises.readdir(canonicalPath, { withFileTypes: true });
  return Promise.all(
    names.map(async (entry): Promise<V2DirectoryEntry> => {
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
    }),
  );
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
