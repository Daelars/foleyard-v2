"use client";

import { ChevronLeft, Play } from "lucide-react";

import { Button } from "@/components/ui/button";

export function FileTableEmptyState({
  currentDirectory,
  currentPlaylistName,
  onBack,
}: {
  currentDirectory: string | null;
  currentPlaylistName?: string | null;
  onBack: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center p-8 text-center text-muted-foreground">
      <div className="mb-4 flex size-16 items-center justify-center rounded-full border border-border/40 bg-card/60 shadow-lg backdrop-blur-xl">
        <Play className="size-8 opacity-20" />
      </div>
      <h3 className="text-lg font-medium">No sounds found</h3>
      {(currentDirectory || currentPlaylistName) && (
        <Button
          variant="outline"
          size="sm"
          className="mt-4 gap-2 rounded-xl"
          onClick={onBack}
        >
          <ChevronLeft className="size-4" /> Go Back
        </Button>
      )}
    </div>
  );
}
