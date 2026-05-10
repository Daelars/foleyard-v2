"use client";

import { startTransition, useCallback, useEffect, useState } from "react";
import { Eraser, PackagePlus, Puzzle, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SOUND_SHELF_CHANGED_EVENT } from "@/lib/extensions/sound-shelf-events";

import type { SoundShelfViewItem } from "@foleyard/sound-shelf";

type SoundShelfProps = {
  onSelectFile?: (fileId: string) => void;
  onItemCountChange?: (count: number) => void;
  makePackEnabled?: boolean;
  onMakePackShelf?: () => Promise<void>;
};

export function SoundShelf({
  onSelectFile,
  onItemCountChange,
  makePackEnabled = false,
  onMakePackShelf,
}: SoundShelfProps) {
  const [items, setItems] = useState<SoundShelfViewItem[]>([]);

  useEffect(() => {
    let isActive = true;

    const loadShelf = async () => {
      try {
        const res = await fetch("/api/extensions/sound-shelf");
        if (!res.ok || !isActive) {
          return;
        }

        const data = (await res.json()) as { items?: SoundShelfViewItem[] };
        if (!isActive) {
          return;
        }

        const nextItems = data.items ?? [];
        startTransition(() => {
          setItems(nextItems);
          onItemCountChange?.(nextItems.length);
        });
      } catch {
        // Silently handle - shelf may not be loaded yet
      }
    };

    const handleShelfChanged = () => {
      void loadShelf();
    };

    void loadShelf();
    window.addEventListener(SOUND_SHELF_CHANGED_EVENT, handleShelfChanged);

    return () => {
      isActive = false;
      window.removeEventListener(
        SOUND_SHELF_CHANGED_EVENT,
        handleShelfChanged,
      );
    };
  }, [onItemCountChange]);

  const handleClear = useCallback(async () => {
    const res = await fetch("/api/extensions/sound-shelf/clear", {
      method: "POST",
    });

    if (res.ok) {
      window.dispatchEvent(new CustomEvent(SOUND_SHELF_CHANGED_EVENT));
    }
  }, []);

  const handleRemove = useCallback(async (fileId: string) => {
    const res = await fetch("/api/extensions/sound-shelf/remove", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileIds: [fileId] }),
    });

    if (res.ok) {
      window.dispatchEvent(new CustomEvent(SOUND_SHELF_CHANGED_EVENT));
    }
  }, []);

  return (
    <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
      <div className="flex items-center gap-2 px-2">
        <Puzzle className="size-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold text-muted-foreground">
          Sound Shelf
        </h3>
        <span className="ml-auto text-xs text-muted-foreground">
          {items.length} {items.length === 1 ? "item" : "items"}
        </span>
      </div>

      <div className="px-2">
        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="justify-center gap-2 rounded-xl text-xs"
            disabled={items.length === 0 || !makePackEnabled}
            onClick={() => {
              void onMakePackShelf?.();
            }}
          >
            <PackagePlus className="size-3.5" />
            Pack
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="justify-center gap-2 rounded-xl text-xs"
            disabled={items.length === 0}
            onClick={() => {
              void handleClear();
            }}
          >
            <Eraser className="size-3.5" />
            Clear
          </Button>
        </div>
      </div>

      <div className="space-y-1">
        {items.map((item) => (
          <div
            key={item.fileId}
            className={cn(
              "flex cursor-pointer items-center gap-3 rounded-lg border border-border/40 bg-card/60 px-3 py-2 shadow-sm backdrop-blur-xl transition-[background-color,color] hover:bg-accent/50 hover:text-accent-foreground",
            )}
            onClick={() => onSelectFile?.(item.fileId)}
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm">{item.filename}</p>
              <p className="text-xs text-muted-foreground">
                {item.format ?? "???"} · {formatDuration(item.duration)}
              </p>
            </div>
            <button
              type="button"
              className="shrink-0 rounded-full p-1 text-muted-foreground transition-[background-color,color] hover:bg-destructive/10 hover:text-destructive focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              onClick={(event) => {
                event.stopPropagation();
                void handleRemove(item.fileId);
              }}
              aria-label={`Remove ${item.filename} from shelf`}
            >
              <X className="size-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatDuration(duration: number | null): string {
  if (duration == null) {
    return "--:--";
  }

  const mins = Math.floor(duration / 60);
  const secs = Math.floor(duration % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}
