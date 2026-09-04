export interface AudioPlayerFileRecord {
  id: string;
  filename: string;
  path: string;
  format: string | null;
  duration: number | null;
  fileSize: number | null;
  isFavorite: boolean;
  tags: { id: string; name: string }[];
}

export interface AudioPlayerProps {
  selectedFile: AudioPlayerFileRecord | null;
  onClose: () => void;
  onPlaybackChange?: (isPlaying: boolean) => void;
  onToggleFavorite: (id: string) => Promise<void>;
  onEnded?: () => void;
  collections: { id: string; name: string; fileCount?: number; isSmart?: boolean }[];
  onAddToCollection: (collectionId: string) => Promise<void>;
  allTags?: { id: string; name: string }[];
  onToggleFileTag?: (fileId: string, tagId: string) => void;
}

export interface AudioPlayerRef {
  togglePlayback: () => void;
}
