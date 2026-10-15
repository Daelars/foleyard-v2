import type { IndexedAudioFile } from "../domain/audio-file";
import type { V2ArchiveEntry, V2ArchivePorts, V2FileContentPorts } from "./operations";
import { V2OutputConflictError, type V2FileVersion } from "./output-ownership";
import type { V2LibraryPorts, V2PathIo } from "./index";

/**
 * Shared in-memory fakes for v2 tests. A plain module (not a test
 * file) so importing it never re-registers another file's suites.
 */

export function audioFile(id: string, overrides?: Partial<IndexedAudioFile>): IndexedAudioFile {
  return {
    id,
    path: `/library/${id}.mp3`,
    filename: `${id}.mp3`,
    libraryRoot: "/library",
    directory: null,
    format: "mp3",
    duration: 60,
    sampleRate: 44100,
    bitDepth: 16,
    channels: 2,
    fileSize: 1024,
    isFavorite: false,
    removedAt: null,
    lastScannedAt: "2026-09-06T00:00:00.000Z",
    mtimeMs: 1,
    ...overrides,
  };
}

export function libraryPorts(files: IndexedAudioFile[]): V2LibraryPorts {
  const byId = new Map(files.map((file) => [file.id, file]));
  return {
    getFileById: (id) => byId.get(id) ?? null,
    getFilesByIds: (ids) => ids.flatMap((id) => (byId.get(id) ? [byId.get(id)!] : [])),
    collectionExists: () => true,
  };
}

function normalizePath(segments: string[]): string {
  const out: string[] = [];
  for (const segment of segments) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") {
      out.pop();
      continue;
    }
    out.push(segment);
  }
  return `/${out.join("/")}`;
}

/** In-memory path layer with link targets and existing entries. */
export function fakePathIo(
  existingPaths: string[],
  linkTargets: Record<string, string> = {},
): V2PathIo {
  const existing = new Set(existingPaths.map((path) => normalizePath(path.split("/"))));
  const links = new Map(
    Object.entries(linkTargets).map(([from, to]) => [
      normalizePath(from.split("/")),
      normalizePath(to.split("/")),
    ] as const),
  );

  const resolve = (candidate: string): string => {
    let current = normalizePath(candidate.split("/"));
    const seen = new Set<string>();
    for (let step = 0; step < 50; step += 1) {
      if (seen.has(current)) throw Object.assign(new Error("ELOOP"), { code: "ELOOP" });
      seen.add(current);
      let deepest: string | null = null;
      for (const link of links.keys()) {
        if (current === link || current.startsWith(`${link}/`)) {
          if (!deepest || link.length > deepest.length) deepest = link;
        }
      }
      if (deepest) {
        current = normalizePath(`${links.get(deepest)!}${current.slice(deepest.length)}`.split("/"));
        continue;
      }
      if (existing.has(current)) return current;
      throw Object.assign(new Error(`ENOENT: ${candidate}`), { code: "ENOENT" });
    }
    throw Object.assign(new Error("ELOOP"), { code: "ELOOP" });
  };

  return {
    realpath: async (candidate) => resolve(candidate),
    lstat: async (candidate) => {
      const normalized = normalizePath(candidate.split("/"));
      if (links.has(normalized)) return { exists: true, isLink: true };
      return { exists: existing.has(normalized), isLink: false };
    },
  };
}

export type MemoryV2Outputs = {
  ports: V2FileContentPorts;
  archive: V2ArchivePorts;
  bytes: Map<string, Uint8Array>;
  /** An entry this job never created (a pre-existing or third-party file). */
  seed(canonicalPath: string, text: string): void;
  /** Replace the entry at a path with a different file, i.e. a new identity. */
  replace(canonicalPath: string, text: string): void;
};

/**
 * In-memory file/archive ports that honour the output-ownership
 * contract: creation is exclusive (a claimed destination rejects with
 * `V2OutputConflictError`), and every write is a new version, so a
 * replacement at a previously owned path is a different entry.
 */
export function memoryOutputPorts(
  opts: {
    roots?: string[];
    dirs?: string[];
    links?: Record<string, string>;
    initialText?: Record<string, string>;
  } = {},
): MemoryV2Outputs {
  const roots = opts.roots ?? ["/lib"];
  const bytes = new Map<string, Uint8Array>();
  const versions = new Map<string, V2FileVersion>();
  const existing = new Set<string>([...roots, ...(opts.dirs ?? [])]);
  let counter = 0;

  const write = (path: string, data: Uint8Array): V2FileVersion => {
    counter += 1;
    const version: V2FileVersion = { device: "memory", fileId: String(counter) };
    bytes.set(path, data);
    versions.set(path, version);
    existing.add(path);
    return version;
  };

  const seed = (path: string, text: string): void => {
    bytes.set(path, new TextEncoder().encode(text));
    existing.add(path);
  };

  for (const [path, text] of Object.entries(opts.initialText ?? {})) seed(path, text);

  const claim = (path: string): void => {
    if (bytes.has(path)) throw new V2OutputConflictError(path);
  };

  const ports: V2FileContentPorts = {
    readFileBytes: async (path) => {
      const data = bytes.get(path);
      if (!data) throw new Error(`missing ${path}`);
      return data;
    },
    copyFile: async (source, dest) => {
      const data = bytes.get(source);
      if (!data) throw new Error(`missing ${source}`);
      claim(dest);
      return write(dest, data);
    },
    writeFileBytes: async (dest, data) => {
      claim(dest);
      return write(dest, data);
    },
    deleteFileIfVersion: async (path, version) => {
      const current = versions.get(path);
      if (!current || current.device !== version.device || current.fileId !== version.fileId) {
        return { removed: false };
      }
      bytes.delete(path);
      versions.delete(path);
      existing.delete(path);
      return { removed: true };
    },
    libraryRoots: () => roots,
    pathIo: () => fakePathIo([...existing], opts.links ?? {}),
  };

  const archive: V2ArchivePorts = {
    createZipArchive: async (entries: V2ArchiveEntry[], dest) => {
      claim(dest);
      const version = write(dest, new TextEncoder().encode(`zip:${entries.length}`));
      return { bytesWritten: entries.length, version };
    },
  };

  return {
    ports,
    archive,
    bytes,
    seed,
    // A replacement is a different file at the same path: a new version.
    replace: (path, text) => {
      write(path, new TextEncoder().encode(text));
    },
  };
}
