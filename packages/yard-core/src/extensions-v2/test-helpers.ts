import type { IndexedAudioFile } from "../domain/audio-file";
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
