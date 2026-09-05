export interface FileRecord {
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

export interface CollectionRecord {
  id: string;
  name: string;
  color?: string | null;
  fileCount?: number;
  isSmart?: boolean;
  filter?: string | null;
}

export interface TagRecord {
  id: string;
  name: string;
  color: string;
}

export const CURRENT_ONBOARDING_VERSION = 1;
