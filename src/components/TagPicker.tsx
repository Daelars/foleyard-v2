"use client";

import { Tags } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export interface TagItem {
  id: string;
  name: string;
}

export function TagPicker({
  allTags,
  fileTagIds,
  onToggleTag,
  label = "Tags",
  align = "end",
}: {
  allTags: TagItem[];
  fileTagIds: Set<string>;
  onToggleTag: (tagId: string) => void;
  label?: string;
  align?: "start" | "end";
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="size-8 rounded-full text-muted-foreground/60 hover:bg-accent/50 hover:text-accent-foreground"
            onClick={(event: React.MouseEvent) => event.stopPropagation()}
            aria-label="Manage tags"
          >
            <Tags className="size-4" />
          </Button>
        }
      />
      <DropdownMenuContent align={align} className="w-48 max-h-64 overflow-y-auto">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="text-muted-foreground">
            {label}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {allTags.length === 0 ? (
            <DropdownMenuItem disabled className="text-muted-foreground">
              No tags yet
            </DropdownMenuItem>
          ) : (
            allTags.map((tag) => (
              <DropdownMenuCheckboxItem
                key={tag.id}
                checked={fileTagIds.has(tag.id)}
                onCheckedChange={() => onToggleTag(tag.id)}
                className="text-popover-foreground"
              >
                {tag.name}
              </DropdownMenuCheckboxItem>
            ))
          )}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
