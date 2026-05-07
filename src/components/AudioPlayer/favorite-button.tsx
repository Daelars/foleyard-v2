"use client";

import { Heart } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function AudioPlayerFavoriteButton({
  fileId,
  isFavorite,
  onToggleFavorite,
}: {
  fileId: string;
  isFavorite: boolean;
  onToggleFavorite: (id: string) => Promise<void>;
}) {
  return (
    <Button
      variant="ghost"
      size="icon"
      className={cn(
        "size-8 rounded-full border border-border bg-muted/40 text-muted-foreground hover:bg-accent hover:text-accent-foreground",
        isFavorite && "text-primary",
      )}
      onClick={() => onToggleFavorite(fileId)}
      aria-label={isFavorite ? "Unlike file" : "Like file"}
    >
      <Heart className={cn("size-4", isFavorite && "fill-current")} />
    </Button>
  );
}
