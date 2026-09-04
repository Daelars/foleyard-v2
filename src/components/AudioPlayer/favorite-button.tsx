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
        "size-8 rounded-full border border-white/10 bg-white/5 text-zinc-400 hover:bg-white/[0.08] hover:text-zinc-100",
        isFavorite && "text-accent-fill hover:text-accent-fill",
      )}
      onClick={() => onToggleFavorite(fileId)}
      aria-label={isFavorite ? "Unlike file" : "Like file"}
    >
      <Heart className={cn("size-4", isFavorite && "fill-current")} />
    </Button>
  );
}
