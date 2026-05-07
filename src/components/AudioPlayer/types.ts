export interface AudioPlayerFileRecord {
  id: string;
  filename: string;
  path: string;
  format: string | null;
  duration: number | null;
  fileSize: number | null;
  isFavorite: boolean;
}

export interface AudioPlayerProps {
  selectedFile: AudioPlayerFileRecord | null;
  onClose: () => void;
  onPlaybackChange?: (isPlaying: boolean) => void;
  onToggleFavorite: (id: string) => Promise<void>;
  collections: { id: string; name: string; fileCount?: number }[];
  onAddToCollection: (collectionId: string) => Promise<void>;
}

export interface AudioPlayerRef {
  togglePlayback: () => void;
}
