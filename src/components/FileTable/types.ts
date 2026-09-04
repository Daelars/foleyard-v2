export interface FileTableFileRecord {
  id: string;
  filename: string;
  path: string;
  directory: string | null;
  format: string | null;
  duration: number | null;
  fileSize: number | null;
  isFavorite: boolean;
  tags: { id: string; name: string }[];
}

export interface FileTableFileTag {
  id: string;
  name: string;
}

export interface SelectModifiers {
  shiftKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
}

export type FileTableSortKey = "filename" | "duration";

export interface FileTableProps {
  files: FileTableFileRecord[];
  directories: string[];
  currentDirectory: string | null;
  currentCollectionName?: string | null;
  onNavigate: (dir: string | null) => void;
  onNavigateLibrary?: () => void;
  selectedFileId: string | null;
  selectedIds?: string[];
  isSelectedFilePlaying?: boolean;
  onSelect: (
    file: FileTableFileRecord,
    index: number,
    modifiers?: SelectModifiers,
  ) => void;
  onToggleSelect?: (file: FileTableFileRecord) => void;
  onToggleFavorite: (id: string) => Promise<void>;
  searchQuery: string;
  isLoading: boolean;
  soundShelfEnabled?: boolean;
  makePackEnabled?: boolean;
  onMakePackFile?: (file: FileTableFileRecord) => Promise<void>;
  folderJanitorEnabled?: boolean;
  onScanFolder?: (folderPath: string) => void;
  allTags?: FileTableFileTag[];
  onToggleFileTag?: (fileId: string, tagId: string) => void;
  sortKey: FileTableSortKey;
  sortDir: 1 | -1;
  onFlipSort: (key: FileTableSortKey) => void;
}
