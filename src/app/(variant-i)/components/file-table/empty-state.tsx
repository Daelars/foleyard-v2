"use client";

// app-v3 adapter for FileTableEmptyState: I empty-state treatment over the
// app's existing loading/failure contract (no dedicated error display —
// FileTable has none today, so neither does this).
import { ChevronLeft } from "lucide-react";

import { Button } from "@/components/variant-i";
import type { FileTableDirectory } from "@/components/FileTable/types";

export function V3EmptyState({
  currentDirectory,
  currentCollectionName,
  searchQuery,
  onBack,
}: {
  currentDirectory: FileTableDirectory | null;
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
          tone="secondary"
          size="sm"
          className="mt-4 gap-2"
          onClick={onBack}
        >
          <ChevronLeft className="size-4" /> Go Back
        </Button>
      )}
    </div>
  );
}