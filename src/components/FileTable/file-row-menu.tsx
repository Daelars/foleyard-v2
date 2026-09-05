"use client";

import {
  Copy,
  FolderPlus,
  PackagePlus,
  Puzzle,
  Tags,
  Trash2,
  X,
} from "lucide-react";

import {
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
} from "@/components/ui/context-menu";
import type {
  FileTableFileRecord,
  FileTableFileTag,
} from "./types";

export function FileRowMenu({
  file,
  menuFilename,
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
}: {
  file: FileTableFileRecord;
  menuFilename: string;
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
}) {
  return (
    <ContextMenuContent className="w-60">
      <ContextMenuLabel
        className="line-clamp-2 break-words leading-relaxed"
        title={file.filename}
      >
        {menuFilename}
      </ContextMenuLabel>
      <ContextMenuItem onClick={() => void handleCopyPath(file)}>
        <Copy className="text-zinc-500" />
        Copy path
      </ContextMenuItem>
      <ContextMenuItem onClick={() => void onToggleFavorite(file.id)}>
        <FolderPlus className="text-zinc-500" />
        {file.isFavorite ? "Unsave" : "Save to favorites"}
      </ContextMenuItem>
      {makePackEnabled ? (
        <ContextMenuItem onClick={() => void onMakePackFile?.(file)}>
          <PackagePlus className="text-zinc-500" />
          Make Pack
        </ContextMenuItem>
      ) : null}
      {soundShelfEnabled ? (
        <>
          <ContextMenuSeparator />
          <ContextMenuItem onClick={() => void onToggleShelf()}>
            {inShelf ? (
              <X className="text-zinc-500" />
            ) : (
              <Puzzle className="text-zinc-500" />
            )}
            {inShelf ? "Remove from Shelf" : "Add to Shelf"}
          </ContextMenuItem>
        </>
      ) : null}
      <ContextMenuSeparator />
      <ContextMenuLabel className="text-zinc-600">
        <span className="inline-flex items-center gap-1.5">
          <Tags className="size-3" /> Tags
        </span>
      </ContextMenuLabel>
      {allTags && allTags.length > 0 ? (
        allTags.map((tag) => (
          <ContextMenuCheckboxItem
            key={tag.id}
            checked={file.tags.some((item) => item.id === tag.id)}
            closeOnClick={false}
            onCheckedChange={() => onToggleFileTag?.(file.id, tag.id)}
          >
            <span
              className="size-2 shrink-0 rounded-full"
              style={{ backgroundColor: tag.color ?? "var(--accent-fill)" }}
            />
            <span className="min-w-0 flex-1 truncate">{tag.name}</span>
          </ContextMenuCheckboxItem>
        ))
      ) : (
        <ContextMenuItem disabled className="text-zinc-500">
          No tags yet
        </ContextMenuItem>
      )}
      {onRemoveFile ? (
        <>
          <ContextMenuSeparator />
          <ContextMenuItem
            onClick={() => void onRemoveFile(file)}
            className="text-zinc-400 hover:bg-destructive/10 hover:text-destructive focus:bg-destructive/10 focus:text-destructive"
          >
            <Trash2 />
            Remove from library
          </ContextMenuItem>
        </>
      ) : null}
    </ContextMenuContent>
  );
}
