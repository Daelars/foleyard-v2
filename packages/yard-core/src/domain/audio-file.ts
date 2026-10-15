export interface AudioFile {
  id: string;
  path: string;
  filename: string;
  libraryRoot: string | null;
  directory: string | null;
  format: string | null;
  duration: number | null;
  sampleRate: number | null;
  bitDepth: number | null;
  channels: number | null;
  fileSize: number | null;
  isFavorite: boolean;
  removedAt?: string | null;
  /**
   * Set when the owning Library root was detached (#271). Detached rows are
   * retained with their organization data but are invisible to every Library
   * read until the root is re-added.
   */
  detachedAt?: string | null;
  lastScannedAt?: string | null;
  mtimeMs?: number | null;
  /** Row creation time: null for rows predating the column. */
  createdAt?: string | null;
}

export interface IndexedAudioFile extends AudioFile {
  removedAt: string | null;
  lastScannedAt: string | null;
  mtimeMs: number | null;
}

/**
 * The one ownership test shared by yard-core reads (#271): a record is owned
 * when it is neither soft-removed nor detached from an unowned root.
 */
export function isOwnedAudioFile(file: Pick<AudioFile, "removedAt" | "detachedAt">): boolean {
  return (file.removedAt ?? null) === null && (file.detachedAt ?? null) === null;
}

export interface AudioFileIdentity {
  id: string;
  path: string;
  filename: string;
  libraryRoot: string | null;
}
