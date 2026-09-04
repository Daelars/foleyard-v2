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
            size="icon"
            className="size-8 shrink-0 rounded-full text-zinc-400 hover:bg-white/10 hover:text-zinc-100"
            aria-label="Add to collection"
            title="Add to collection"
          >
            <FolderPlus className="size-4" />
          </Button>
        }
      />
      <DropdownMenuContent
        align="end"
        className="w-60"
      >
        <DropdownMenuGroup>
          <DropdownMenuLabel className="text-zinc-500">
            Collections
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {collections.length === 0 ? (
            <DropdownMenuItem disabled className="text-zinc-500">
              No collections found
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
