export interface FileTableFileRecord {
  id: string;
  filename: string;
  path: string;
  directory: string | null;
  format: string | null;
  duration: number | null;
  fileSize: number | null;
  isFavorite: boolean;
}

export interface FileTableProps {
  files: FileTableFileRecord[];
  directories: string[];
  currentDirectory: string | null;
  currentPlaylistName?: string | null;
  onNavigate: (dir: string | null) => void;
  onNavigateLibrary?: () => void;
  selectedFileId: string | null;
  isSelectedFilePlaying?: boolean;
  onSelect: (file: FileTableFileRecord, index: number) => void;
  onToggleFavorite: (id: string) => Promise<void>;
  searchQuery: string;
  isLoading: boolean;
  soundShelfEnabled?: boolean;
  makePackEnabled?: boolean;
  onMakePackFile?: (file: FileTableFileRecord) => Promise<void>;
  folderJanitorEnabled?: boolean;
  onScanFolder?: (folderPath: string) => void;
}
