"use client";

import { FolderPlus } from "lucide-react";

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
  collections: { id: string; name: string; fileCount?: number }[];
  onAddToCollection: (collectionId: string) => Promise<void>;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            className="h-9 rounded-full border border-primary/35 bg-primary/10 px-3.5 text-sm font-medium text-card-foreground hover:bg-primary/15"
          >
            <FolderPlus className="mr-2.5 size-4" />
            Add to Playlist
          </Button>
        }
      />
      <DropdownMenuContent
        align="end"
        className="w-60 rounded-2xl border-border bg-popover text-popover-foreground"
      >
        <DropdownMenuGroup>
          <DropdownMenuLabel className="text-muted-foreground">
            Playlists
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {collections.length === 0 ? (
            <DropdownMenuItem disabled className="text-muted-foreground">
              No playlists found
            </DropdownMenuItem>
          ) : (
            collections.map((collection) => (
              <DropdownMenuItem
                key={collection.id}
                onClick={() => onAddToCollection(collection.id)}
                className="text-popover-foreground"
              >
                <span className="truncate">{collection.name}</span>
                {typeof collection.fileCount === "number" ? (
                  <span className="ml-auto text-xs text-muted-foreground">
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
