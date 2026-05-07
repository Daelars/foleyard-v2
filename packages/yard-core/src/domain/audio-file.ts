export interface AudioFile {
  id: string;
  path: string;
  filename: string;
  directory: string | null;
  format: string | null;
  duration: number | null;
  sampleRate: number | null;
  bitDepth: number | null;
  channels: number | null;
  fileSize: number | null;
  isFavorite: boolean;
  removedAt?: string | null;
  lastScannedAt?: string | null;
  mtimeMs?: number | null;
}

export interface IndexedAudioFile extends AudioFile {
  removedAt: string | null;
  lastScannedAt: string | null;
  mtimeMs: number | null;
}

export interface AudioFileIdentity {
  id: string;
  path: string;
  filename: string;
}
