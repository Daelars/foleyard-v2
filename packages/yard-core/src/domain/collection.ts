export interface Collection {
  id: string;
  name: string;
  color?: string | null;
  createdAt?: string | null;
  fileCount?: number;
  isSmart?: boolean;
  filter?: string | null;
}
