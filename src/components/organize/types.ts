export type OrganizeCollection = {
  id: string;
  name: string;
  fileCount?: number;
  color?: string | null;
  isSmart?: boolean;
};

export type OrganizeTag = {
  id: string;
  name: string;
  color: string;
};

export interface OrganizeViewProps {
  collections: OrganizeCollection[];
  tags: OrganizeTag[];
  selectedTagId: string | null;
  /** Lazily resolved smart-collection counts, keyed by collection id. */
  smartCounts?: Record<string, number>;
  onOpenCollection: (id: string) => void;
  /** Fired when a smart collection is expanded so its count resolves on open. */
  onRequestSmartCount?: (id: string) => void;
  onCreateCollection: (name: string, color: string) => Promise<string | null>;
  onRenameCollection: (id: string, name: string) => Promise<void>;
  onDeleteCollection: (id: string) => void;
  onUpdateCollectionColor: (id: string, color: string) => void;
  onCreateTag: (name: string, color: string) => Promise<string | null>;
  onRenameTag: (id: string, name: string) => Promise<void>;
  onDeleteTag: (id: string) => void;
  onUpdateTagColor: (id: string, color: string) => void;
  onSelectTag: (id: string | null) => void;
}

export type CollectionsSectionProps = Pick<
  OrganizeViewProps,
  | "collections"
  | "smartCounts"
  | "onOpenCollection"
  | "onRequestSmartCount"
  | "onCreateCollection"
  | "onRenameCollection"
  | "onDeleteCollection"
  | "onUpdateCollectionColor"
>;

export type TagsSectionProps = Pick<
  OrganizeViewProps,
  | "tags"
  | "selectedTagId"
  | "onCreateTag"
  | "onRenameTag"
  | "onDeleteTag"
  | "onUpdateTagColor"
  | "onSelectTag"
>;
