export interface AudioPlayerFileRecord {
  id: string;
  filename: string;
  path: string;
  format: string | null;
  duration: number | null;
  fileSize: number | null;
  mtimeMs?: number | null;
  isFavorite: boolean;
  tags: { id: string; name: string }[];
}

export interface AudioPlayerProps {
  selectedFile: AudioPlayerFileRecord | null;
  onClose: () => void;
  onPlaybackChange?: (isPlaying: boolean) => void;
  onToggleFavorite: (id: string) => Promise<void>;
  onEnded?: () => void;
  onNext: () => void;
  onPrev: () => void;
  autoplay: boolean;
  onToggleAutoplay: (checked: boolean) => void;
  nextTitle?: string | null;
  collections: { id: string; name: string; fileCount?: number; isSmart?: boolean }[];
  onAddToCollection: (collectionId: string) => Promise<void>;
  onCreateCollection?: () => void;
}

export interface AudioPlayerRef {
  togglePlayback: () => void;
}
