"use client";

import { ChevronLeft } from "lucide-react";

import { Button } from "@/components/ui/button";

export function FileTableEmptyState({
  currentDirectory,
  currentCollectionName,
  searchQuery,
  onBack,
}: {
  currentDirectory: string | null;
  currentCollectionName?: string | null;
  searchQuery?: string;
  onBack: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
      <p className="py-12 text-2xl font-semibold text-zinc-500">
        {searchQuery
          ? `Nothing matches "${searchQuery}".`
          : "Nothing here yet."}
      </p>
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
