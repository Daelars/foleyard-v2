"use client";

import { CollectionsSection } from "@/components/workspace/organize/collections-section";
import { OrganizeShell } from "@/components/workspace/organize/organize-shell";
import { TagsSection } from "@/components/workspace/organize/tags-section";
import type { OrganizeViewProps } from "@/components/organize/types";

export type {
  OrganizeCollection,
  OrganizeTag,
  OrganizeViewProps,
} from "@/components/organize/types";

export function OrganizeView({
  collections,
  tags,
  selectedTagId,
  smartCounts,
  onOpenCollection,
  onRequestSmartCount,
  onCreateCollection,
  onRenameCollection,
  onDeleteCollection,
  onUpdateCollectionColor,
  onCreateTag,
  onRenameTag,
  onDeleteTag,
  onUpdateTagColor,
  onSelectTag,
}: OrganizeViewProps) {
  return (
    <OrganizeShell>
      <TagsSection
        tags={tags}
        selectedTagId={selectedTagId}
        onCreateTag={onCreateTag}
        onRenameTag={onRenameTag}
        onDeleteTag={onDeleteTag}
        onUpdateTagColor={onUpdateTagColor}
        onSelectTag={onSelectTag}
      />
      <CollectionsSection
        collections={collections}
        smartCounts={smartCounts}
        onOpenCollection={onOpenCollection}
        onRequestSmartCount={onRequestSmartCount}
        onCreateCollection={onCreateCollection}
        onRenameCollection={onRenameCollection}
        onDeleteCollection={onDeleteCollection}
        onUpdateCollectionColor={onUpdateCollectionColor}
      />
    </OrganizeShell>
  );
}
