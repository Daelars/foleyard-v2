"use client";

// app-v3 adapter for FileRowMenu: the file-row context menu rendered with
// the variant I Menu treatment (filename label, icon items, separator,
// danger item, tag checklist with provenance marks, v2 contributions).
import { Copy, FolderPlus, PackagePlus, Puzzle, Tags, Trash2, X } from "lucide-react";

import { MenuItem, MenuSeparator } from "@/components/variant-i";
import { TagOriginMark } from "@/components/FileTable/tag-origin-mark";
import type {
  FileTableFileRecord,
  FileTableFileTag,
} from "@/components/FileTable/types";
import type { V2ResolvedContribution } from "@yard-core";

export function V3RowMenuItems({
  file,
  handleCopyPath,
  onToggleFavorite,
  makePackEnabled,
  onMakePackFile,
  soundShelfEnabled,
  inShelf,
  onToggleShelf,
  allTags,
  onToggleFileTag,
  onRemoveFile,
  v2Items,
  onV2Command,
}: {
  file: FileTableFileRecord;
  handleCopyPath: (file: FileTableFileRecord) => Promise<void>;
  onToggleFavorite: (id: string) => Promise<void>;
  makePackEnabled: boolean;
  onMakePackFile?: (file: FileTableFileRecord) => Promise<void>;
  soundShelfEnabled: boolean;
  inShelf: boolean;
  onToggleShelf: () => void;
  allTags?: FileTableFileTag[];
  onToggleFileTag?: (fileId: string, tagId: string) => void;
  onRemoveFile?: (file: FileTableFileRecord) => Promise<void>;
  v2Items?: V2ResolvedContribution[];
  onV2Command?: (item: V2ResolvedContribution) => void;
}) {
  const attachmentsByTagId = new Map(file.tags.map((item) => [item.id, item]));
  return (
    <>
      <MenuItem icon={<Copy />} onClick={() => void handleCopyPath(file)}>
        Copy path
      </MenuItem>
      <MenuItem
        icon={<FolderPlus />}
        checked={file.isFavorite}
        onClick={() => void onToggleFavorite(file.id)}
      >
        {file.isFavorite ? "Unsave" : "Save to favorites"}
      </MenuItem>
      {makePackEnabled ? (
        <MenuItem icon={<PackagePlus />} onClick={() => void onMakePackFile?.(file)}>
          Make Pack
        </MenuItem>
      ) : null}
      {soundShelfEnabled ? (
        <>
          <MenuSeparator />
          <MenuItem
            icon={inShelf ? <X /> : <Puzzle />}
            onClick={() => void onToggleShelf()}
          >
            {inShelf ? "Remove from Shelf" : "Add to Shelf"}
          </MenuItem>
        </>
      ) : null}
      <MenuSeparator />
      <div className="px-2.5 pb-1 pt-2">
        <p className="flex items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-[0.1em] text-zinc-600">
          <Tags className="size-3" /> Tags
        </p>
      </div>
      {allTags && allTags.length > 0 ? (
        allTags.map((tag) => {
          const attached = file.tags.some((item) => item.id === tag.id);
          return (
            <MenuItem
              key={tag.id}
              checked={attached}
              onClick={() => onToggleFileTag?.(file.id, tag.id)}
            >
              <span
                className="size-2 shrink-0 rounded-full"
                style={{ backgroundColor: tag.color ?? "var(--accent-fill)" }}
              />
              <span className="min-w-0 flex-1 truncate">{tag.name}</span>
              <span className="ml-1">
                <TagOriginMark
                  origin={attachmentsByTagId.get(tag.id)?.origin}
                  confidence={attachmentsByTagId.get(tag.id)?.confidence}
                />
              </span>
            </MenuItem>
          );
        })
      ) : (
        <MenuItem disabled>No tags yet</MenuItem>
      )}
      {onRemoveFile ? (
        <>
          <MenuSeparator />
          <MenuItem danger onClick={() => void onRemoveFile(file)}>
            <Trash2 />
            Remove from library
          </MenuItem>
        </>
      ) : null}
      {v2Items && v2Items.length > 0 && onV2Command ? (
        <>
          <MenuSeparator />
          {v2Items.map((item) => {
            const disabled = !item.availability.available;
            return (
              <MenuItem
                key={item.key}
                icon={<Puzzle />}
                disabled={disabled}
                title={
                  disabled && !item.availability.available
                    ? item.availability.reason
                    : `${item.title} · ${item.extensionName}`
                }
                onClick={() => {
                  if (!disabled) onV2Command(item);
                }}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{item.title}</span>
                  {!item.availability.available ? (
                    <span className="block truncate text-[10px] text-zinc-600">
                      {item.availability.reason}
                    </span>
                  ) : null}
                </span>
              </MenuItem>
            );
          })}
        </>
      ) : null}
    </>
  );
}