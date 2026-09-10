"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Puzzle } from "lucide-react";

import { validateV2DropCandidates, type ExtensionV2Catalog } from "@yard-core";

import {
  invokeV2Command,
  resolveV2UiPoint,
  type V2UiState,
} from "@/lib/extensions-v2/contributions";
import {
  screenV2DropAudio,
  type V2DropOffer,
} from "@/components/extensions-v2/menus";
import { useV2FocusRestore } from "@/components/extensions-v2/shared";
import { Button } from "@/components/variant-i";

/**
 * Real application drop-zone bridge for app-v3, I treatment. Wraps the
 * Library workspace region with the exact drag/validate logic from the
 * v2 drop menu adapter: genuine OS drop events validate into a drop
 * context (count, names, audio screening), drop-scope contributions
 * resolve through the production resolver with capability checks, and
 * invocation runs the single v2 execution path. Overlays use the I
 * treatment while the validation, filtering (including selection-empty
 * offers) and focus-restore behavior are unchanged.
 */
export function V3LibraryDropZone({
  children,
  catalog,
  uiState,
}: {
  children: React.ReactNode;
  catalog: ExtensionV2Catalog | null;
  uiState: V2UiState;
}) {
  const items = useMemo(
    () => resolveV2UiPoint(catalog, "drop-menu", { fileIds: [] }, uiState),
    [catalog, uiState],
  );

  const [dragging, setDragging] = useState(false);
  const [offers, setOffers] = useState<V2DropOffer[] | null>(null);
  const [rejection, setRejection] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const wasDragging = useRef(false);
  useV2FocusRestore(!dragging && offers === null);

  useEffect(() => {
    if (!dragging && wasDragging.current) {
      wasDragging.current = false;
    }
  }, [dragging]);

  const evaluateNames = useCallback(
    (names: string[]): void => {
      const validation = validateV2DropCandidates(
        names.map((name) => ({ name })),
      );
      if (!validation.ok) {
        setRejection(validation.reason);
        setOffers([]);
        return;
      }
      const { audio, skipped } = screenV2DropAudio(names);
      if (audio.length === 0) {
        setRejection(
          `No audio files among ${names.length} dropped item(s); only sounds can be offered to extensions.`,
        );
        setOffers([]);
        return;
      }
      setRejection(skipped > 0 ? `${skipped} non-audio item(s) ignored.` : null);
      setOffers(
        items
          .filter(
            (item) =>
              item.availability.available ||
              (!item.availability.available &&
                item.availability.code === "selection-empty"),
          )
          .map((item) => ({ item, audioCount: audio.length, skipped })),
      );
    },
    [items],
  );

  const handleInvoke = useCallback((offer: V2DropOffer) => {
    void invokeV2Command({
      extensionId: offer.item.extensionId,
      commandId: offer.item.commandId,
      dropFileCount: offer.audioCount,
    }).then((result) => {
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      const body = result.body as { ok?: boolean; error?: { message?: string } };
      if (!body?.ok) toast.error(body?.error?.message ?? "Drop command failed.");
      else toast.success(`${offer.item.title} started for ${offer.audioCount} file(s).`);
    });
  }, []);

  if (items.length === 0) return <>{children}</>;

  return (
    <div
      ref={containerRef}
      className="relative flex min-h-0 min-w-0 flex-1 flex-col"
      onDragEnter={(event) => {
        if (!event.dataTransfer?.types.includes("Files")) return;
        event.preventDefault();
        wasDragging.current = true;
        setDragging(true);
      }}
      onDragOver={(event) => {
        if (!event.dataTransfer?.types.includes("Files")) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
      }}
      onDragLeave={(event) => {
        if (containerRef.current?.contains(event.relatedTarget as Node | null)) return;
        setDragging(false);
        setOffers(null);
        setRejection(null);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        const names = Array.from(event.dataTransfer?.files ?? []).map((file) => file.name);
        evaluateNames(names);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && (dragging || offers !== null)) {
          event.stopPropagation();
          setDragging(false);
          setOffers(null);
          setRejection(null);
        }
      }}
    >
      {children}
      {dragging ? (
        <div
          role="menu"
          aria-label="Drop sounds for extension actions"
          className="absolute inset-0 z-20 flex items-center justify-center rounded-lg border-2 border-dashed border-[color-mix(in_oklab,var(--accent-fill)_60%,transparent)] bg-black/60 p-4 backdrop-blur-sm"
        >
          <p className="text-center text-sm text-zinc-200">
            Drop sounds to offer them to extensions
            <span className="mt-1 block text-xs text-zinc-500">Escape cancels</span>
          </p>
        </div>
      ) : null}
      {offers !== null && !dragging ? (
        <div
          role="menu"
          aria-label="Extension drop actions"
          className="absolute inset-x-0 bottom-0 z-20 rounded-b-lg border-t border-[var(--vi-edge)] bg-[#101014]/95 p-3 backdrop-blur"
        >
          {rejection ? <p className="mb-2 text-xs text-zinc-500">{rejection}</p> : null}
          {offers.length === 0 ? (
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-zinc-400">
                {rejection ?? "No extension drop actions are available right now."}
              </p>
              <Button
                tone="ghost"
                size="sm"
                onClick={() => {
                  setOffers(null);
                  setRejection(null);
                }}
              >
                Dismiss
              </Button>
            </div>
          ) : (
            <ul className="flex min-w-0 flex-wrap gap-1.5">
              {offers.map((offer) => (
                <li key={offer.item.key}>
                  <Button
                    tone="secondary"
                    size="sm"
                    onClick={() => {
                      handleInvoke(offer);
                      setOffers(null);
                      setRejection(null);
                    }}
                    title={`${offer.item.title} · ${offer.audioCount} audio file(s)`}
                  >
                    <Puzzle />
                    {offer.item.title}
                    <span className="font-mono text-[10px] text-zinc-500">
                      {offer.audioCount}
                    </span>
                  </Button>
                </li>
              ))}
              <li>
                <Button
                  tone="ghost"
                  size="sm"
                  onClick={() => {
                    setOffers(null);
                    setRejection(null);
                  }}
                >
                  Dismiss
                </Button>
              </li>
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}