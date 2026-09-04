export interface FileTableFileRecord {
  id: string;
  filename: string;
  path: string;
  directory: string | null;
  format: string | null;
  duration: number | null;
  fileSize: number | null;
  mtimeMs?: number | null;
  isFavorite: boolean;
  tags: { id: string; name: string }[];
}

export interface FileTableDirectory {
  key: string;
  label: string;
  libraryRoot: string;
  directory: string | null;
  absolutePath: string;
  isRoot: boolean;
  showRoot: boolean;
}

export interface FileTableFileTag {
  id: string;
  name: string;
  color?: string;
}

export interface SelectModifiers {
  shiftKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
}

export type FileTableSortKey = "filename" | "duration";

export interface FileTableProps {
  files: FileTableFileRecord[];
  directories: FileTableDirectory[];
  currentDirectory: FileTableDirectory | null;
  currentCollectionName?: string | null;
  onNavigate: (dir: FileTableDirectory | null) => void;
  onNavigateLibrary?: () => void;
  selectedFileId: string | null;
  selectedIds?: string[];
  isSelectedFilePlaying?: boolean;
  onSelect: (
    file: FileTableFileRecord,
    index: number,
    modifiers?: SelectModifiers,
  ) => void;
  onToggleFavorite: (id: string) => Promise<void>;
  searchQuery: string;
  isLoading: boolean;
  hasMore?: boolean;
  onLoadMore?: () => void;
  showContainerBorder?: boolean;
  soundShelfEnabled?: boolean;
  shelfFileIds?: string[];
  makePackEnabled?: boolean;
  onMakePackFile?: (file: FileTableFileRecord) => Promise<void>;
  onRemoveFile?: (file: FileTableFileRecord) => Promise<void>;
  folderJanitorEnabled?: boolean;
  onScanFolder?: (folderPath: string) => void;
  allTags?: FileTableFileTag[];
  onToggleFileTag?: (fileId: string, tagId: string) => void;
  sortKey: FileTableSortKey;
  sortDir: 1 | -1;
  onFlipSort: (key: FileTableSortKey) => void;
}
