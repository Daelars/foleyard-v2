"use client";

import { useEffect, useRef, useState } from "react";
import { Puzzle } from "lucide-react";

import {
  validateV2DropCandidates,
  type V2ResolvedContribution,
} from "@yard-core";
import { ContextMenuItem, ContextMenuSeparator } from "@/components/ui/context-menu";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

import { V2UnavailableReason, useV2FocusRestore, v2FocusRing, v2PanelClass } from "./shared";

/**
 * Generic v2 menu/selection/toolbar/drop adapters (Application
 * context, R6). Every adapter consumes resolved contribution records
 * (data only) and a single `onInvoke` callback — extensions never
 * supply callbacks, markup, or ordering of their own.
 *
 * - `V2ContextMenuItems` / `V2DropdownMenuItems`: context-aware items
 *   for file/folder menus over a validated selection/context, in
 *   resolution order. Unavailable items render disabled with reasons.
 * - `V2SelectionActions`: actions for the current selection with
 *   explicit empty/ineligible handling (never a blank bar).
 * - `V2Toolbar`: declarative command placement; buttons invoke by
 *   stable key, no extension-specific callbacks.
 * - `V2DropMenu`: the real application drop-menu adapter. It observes
 *   genuine `drop`/`drag` events on its container, validates the drop
 *   context (count, names, audio extensions), and offers only the
 *   drop-scope commands whose capability checks pass. A fixture-only
 *   imitation without validated drop data does not satisfy this.
 */

function MenuRow({ item }: { item: V2ResolvedContribution }) {
  const disabled = !item.availability.available;
  return (
    <>
      <span className="min-w-0 flex-1">
        <span className="block truncate">{item.title}</span>
        <V2UnavailableReason item={item} />
      </span>
      <span className="sr-only">{item.extensionName}</span>
      <span aria-hidden="true" className="hidden">
        {disabled ? "unavailable" : "available"}
      </span>
    </>
  );
}

export function V2ContextMenuItems({
  items,
  onInvoke,
}: {
  items: V2ResolvedContribution[];
  onInvoke: (item: V2ResolvedContribution) => void;
}) {
  if (items.length === 0) return null;
  return (
    <>
      <ContextMenuSeparator />
      {items.map((item) => {
        const disabled = !item.availability.available;
        return (
          <ContextMenuItem
            key={item.key}
            disabled={disabled}
            title={disabled && !item.availability.available ? item.availability.reason : item.title}
            onClick={() => {
              if (!disabled) onInvoke(item);
            }}
          >
            <Puzzle className="text-zinc-500" />
            <MenuRow item={item} />
          </ContextMenuItem>
        );
      })}
    </>
  );
}

export function V2DropdownMenuItems({
  items,
  onInvoke,
}: {
  items: V2ResolvedContribution[];
  onInvoke: (item: V2ResolvedContribution) => void;
}) {
  if (items.length === 0) return null;
  return (
    <>
      {items.map((item) => {
        const disabled = !item.availability.available;
        return (
          <DropdownMenuItem
            key={item.key}
            disabled={disabled}
            title={disabled && !item.availability.available ? item.availability.reason : item.title}
            onClick={() => {
              if (!disabled) onInvoke(item);
            }}
            className="text-popover-foreground"
          >
            <Puzzle className="text-zinc-500" />
            <MenuRow item={item} />
          </DropdownMenuItem>
        );
      })}
    </>
  );
}

export function V2SelectionActions({
  items,
  selectionCount,
  onInvoke,
}: {
  items: V2ResolvedContribution[];
  selectionCount: number;
  onInvoke: (item: V2ResolvedContribution) => void;
}) {
  const eligible = items.filter((item) => item.availability.available);
  const ineligible = items.filter((item) => !item.availability.available);
  return (
    <div
      className={cn(v2PanelClass, "flex flex-wrap items-center gap-2 px-3 py-2")}
      role="toolbar"
      aria-label="Extension selection actions"
    >
      <span className="font-mono text-[11px] font-semibold tabular-nums text-zinc-400">
        {selectionCount} selected
      </span>
      {items.length === 0 || selectionCount === 0 ? (
        <span className="text-xs text-zinc-500">
          {selectionCount === 0
            ? "Select Library items to see extension actions."
            : "No extension actions registered for selections."}
        </span>
      ) : (
        <>
          {eligible.map((item) => (
            <Button
              key={item.key}
              type="button"
              variant="outline"
              size="xs"
              className={cn("gap-1.5", v2FocusRing)}
              onClick={() => onInvoke(item)}
              title={`${item.title} · ${item.extensionName}`}
            >
              <Puzzle className="size-3.5" />
              {item.title}
            </Button>
          ))}
          {eligible.length === 0 ? (
            <span className="text-xs text-zinc-500">
              No extension actions are eligible for this selection.
            </span>
          ) : null}
          {ineligible.map((item) => (
            <span
              key={item.key}
              className="cursor-not-allowed truncate text-xs text-zinc-600"
              title={!item.availability.available ? item.availability.reason : item.title}
            >
              {item.title}
            </span>
          ))}
        </>
      )}
    </div>
  );
}

export function V2Toolbar({
  items,
  onInvoke,
  label = "Extension toolbar",
}: {
  items: V2ResolvedContribution[];
  onInvoke: (item: V2ResolvedContribution) => void;
  label?: string;
}) {
  useV2FocusRestore(items.length > 0);
  if (items.length === 0) return null;
  return (
    <div
      className="flex min-w-0 flex-wrap items-center gap-1.5"
      role="toolbar"
      aria-label={label}
    >
      {items.map((item) => {
        const disabled = !item.availability.available;
        return (
          <Button
            key={item.key}
            type="button"
            variant="ghost"
            size="xs"
            disabled={disabled}
            onClick={() => onInvoke(item)}
            title={
              disabled && !item.availability.available
                ? item.availability.reason
                : `${item.title} · ${item.extensionName}`
            }
            aria-disabled={disabled}
            className={cn("gap-1.5", v2FocusRing)}
          >
            <Puzzle className="size-3.5" />
            <span className="max-w-32 truncate">{item.title}</span>
          </Button>
        );
      })}
    </div>
  );
}

const AUDIO_DROP_EXTENSIONS = new Set([
  "wav",
  "aiff",
  "aif",
  "flac",
  "mp3",
  "ogg",
  "oga",
  "opus",
  "m4a",
  "aac",
  "wma",
]);

/** Screen dropped names to audio files the Library can index. */
export function screenV2DropAudio(names: readonly string[]): {
  audio: string[];
  skipped: number;
} {
  const audio: string[] = [];
  let skipped = 0;
  for (const name of names) {
    const extension = name.split(".").pop()?.toLowerCase() ?? "";
    if (AUDIO_DROP_EXTENSIONS.has(extension)) audio.push(name);
    else skipped += 1;
  }
  return { audio, skipped };
}

export type V2DropOffer = {
  item: V2ResolvedContribution;
  audioCount: number;
  skipped: number;
};

/**
 * Real application drop-menu adapter. Wrap the drop target region;
 * while files hover, a menu offers the resolved drop-scope commands
 * whose availability passes for the validated drop context. Escape
 * dismisses and restores focus; the menu never opens for invalid
 * drops (empty, nameless, over-limit, or no audio files).
 */
export function V2DropMenu({
  items,
  onInvoke,
  children,
  className,
}: {
  items: V2ResolvedContribution[];
  onInvoke: (offer: V2DropOffer) => void;
  children: React.ReactNode;
  className?: string;
}) {
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
  }, [dragging ]);

  const evaluateNames = (names: string[]): void => {
    const validation = validateV2DropCandidates(names.map((name) => ({ name })));
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
    // Items arrive resolved without a drop count; capability and
    // permission denials stay excluded, while denials caused only by
    // the missing count (`selection-empty`) are offered against the
    // validated audio count. Execution preflight rechecks regardless.
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
  };

  return (
    <div
      ref={containerRef}
      className={cn("relative min-w-0", className)}
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
          className="absolute inset-0 z-20 flex items-center justify-center rounded-xl border-2 border-dashed border-accent-fill/60 bg-black/60 p-4 backdrop-blur-sm"
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
          className="absolute inset-x-0 bottom-0 z-20 rounded-b-xl border-t border-white/10 bg-shell/95 p-3 backdrop-blur-2xl"
        >
          {rejection ? <p className="mb-2 text-xs text-zinc-500">{rejection}</p> : null}
          {offers.length === 0 ? (
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-zinc-400">
                {rejection ?? "No extension drop actions are available right now."}
              </p>
              <Button
                type="button"
                variant="ghost"
                size="xs"
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
                    type="button"
                    variant="outline"
                    size="xs"
                    className={cn("gap-1.5", v2FocusRing)}
                    onClick={() => {
                      onInvoke(offer);
                      setOffers(null);
                      setRejection(null);
                    }}
                    title={`${offer.item.title} · ${offer.audioCount} audio file(s)`}
                  >
                    <Puzzle className="size-3.5" />
                    {offer.item.title}
                    <span className="font-mono text-[10px] text-zinc-500">
                      {offer.audioCount}
                    </span>
                  </Button>
                </li>
              ))}
              <li>
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
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
