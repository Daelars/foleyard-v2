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

/** Session-level volume and mute state, shared across views (#291). */
export interface AudioPlayerPreferences {
  volume: number;
  isMuted: boolean;
  handleVolumeChange: (value: number | readonly number[]) => void;
  /** Toggle mute, always leaving an audible level when the result is unmuted. */
  toggleMute: () => void;
}

export interface AudioPlayerProps {
  selectedFile: AudioPlayerFileRecord | null;
  preferences: AudioPlayerPreferences;
  onClose: () => void;
  onPlaybackChange?: (isPlaying: boolean) => void;
  onToggleFavorite: (id: string) => Promise<void>;
  onEnded?: () => void;
  onNext: () => void;
  onPrev: () => void;
  autoplay: boolean;
  onToggleAutoplay: (checked: boolean) => void;
  nextTitle?: string | null;
  /** Where the queue started, e.g. "Library" or "Favorites". */
  playingFrom?: string | null;
  /** Whether Next/Previous can move within the queue. */
  canStepQueue?: boolean;
  /** Session-level explanation of a queue action that could not happen. */
  notice?: string | null;
  onDismissNotice?: () => void;
  collections: { id: string; name: string; fileCount?: number; isSmart?: boolean }[];
  onAddToCollection: (collectionId: string) => Promise<void>;
  onCreateCollection?: () => void;
}

export interface AudioPlayerRef {
  togglePlayback: () => void;
}
