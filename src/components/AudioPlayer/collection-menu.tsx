"use client";

import { Filter, FolderPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function AudioPlayerCollectionMenu({
  collections,
  onAddToCollection,
}: {
  collections: { id: string; name: string; fileCount?: number; isSmart?: boolean }[];
  onAddToCollection: (collectionId: string) => Promise<void>;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            className="h-9 rounded-full border border-white/10 bg-white/5 px-3.5 text-sm font-medium text-zinc-200 hover:bg-white/[0.08] hover:text-zinc-100"
          >
            <FolderPlus className="mr-2.5 size-4" />
            Add to Playlist
          </Button>
        }
      />
      <DropdownMenuContent
        align="end"
        className="w-60"
      >
        <DropdownMenuGroup>
          <DropdownMenuLabel className="text-zinc-500">
            Playlists
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {collections.length === 0 ? (
            <DropdownMenuItem disabled className="text-zinc-500">
              No playlists found
            </DropdownMenuItem>
          ) : (
            collections.map((collection) => (
              <DropdownMenuItem
                key={collection.id}
                onClick={() => onAddToCollection(collection.id)}
                className="text-popover-foreground"
              >
                {collection.isSmart ? (
                  <Filter className="mr-2 size-3.5 shrink-0 text-zinc-500" />
                ) : null}
                <span className="truncate">{collection.name}</span>
                {collection.isSmart ? (
                  <span className="ml-1 text-[10px] text-zinc-500">Smart</span>
                ) : null}
                {typeof collection.fileCount === "number" ? (
                  <span className="ml-auto font-mono text-xs tabular-nums text-zinc-500">
                    {collection.fileCount}
                  </span>
                ) : null}
              </DropdownMenuItem>
            ))
          )}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
