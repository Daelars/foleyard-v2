"use client";

import { ChevronLeft, Play } from "lucide-react";

import { Button } from "@/components/ui/button";

export function FileTableEmptyState({
  currentDirectory,
  currentCollectionName,
  onBack,
}: {
  currentDirectory: string | null;
  currentCollectionName?: string | null;
  onBack: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center p-8 text-center text-zinc-500">
      <div className="mb-4 flex size-16 items-center justify-center rounded-full border border-white/10 bg-white/[0.03]">
        <Play className="size-8 opacity-20" />
      </div>
      <h3 className="text-lg font-semibold text-zinc-300">No sounds found</h3>
      {(currentDirectory || currentCollectionName) && (
        <Button
          variant="outline"
          size="sm"
          className="mt-4 gap-2 rounded-xl border-white/10 bg-white/5 text-zinc-200 shadow-none backdrop-blur-none hover:border-accent-fill/50 hover:bg-white/[0.07] hover:text-zinc-100"
          onClick={onBack}
        >
          <ChevronLeft className="size-4" /> Go Back
        </Button>
      )}
    </div>
  );
}
