"use client";

import { useMemo } from "react";
import { Pause, Play, X } from "lucide-react";

import { TagPicker, type TagItem } from "@/components/TagPicker";
import { AudioScrubber } from "@/components/ui/waveform";
import { Button } from "@/components/ui/button";

import { formatTime } from "./format-time";
import { AudioPlayerCollectionMenu } from "./collection-menu";
import { AudioPlayerFavoriteButton } from "./favorite-button";
import type { AudioPlayerFileRecord } from "./types";
import { AudioPlayerVolumeControl } from "./volume-control";

export function AudioPlayerShell({
  collections,
  currentTime,
  effectiveDuration,
  file,
  isMuted,
  isPlaying,
  onAddToCollection,
  onClose,
  onSeek,
  onToggleFavorite,
  onToggleMuted,
  onTogglePlayback,
  onVolumeChange,
  title,
  volume,
  waveformData,
  allTags,
  onToggleFileTag,
}: {
  collections: { id: string; name: string; fileCount?: number; isSmart?: boolean }[];
  currentTime: number;
  effectiveDuration: number;
  file: AudioPlayerFileRecord;
  isMuted: boolean;
  isPlaying: boolean;
  onAddToCollection: (collectionId: string) => Promise<void>;
  onClose: () => void;
  onSeek: (time: number) => void;
  onToggleFavorite: (id: string) => Promise<void>;
  onToggleMuted: () => void;
  onTogglePlayback: () => void;
  onVolumeChange: (value: number | readonly number[]) => void;
  title: string;
  volume: number;
  waveformData: number[];
  allTags?: TagItem[];
  onToggleFileTag?: (fileId: string, tagId: string) => void;
}) {
  return (
    <div className="fixed inset-x-4 bottom-4 z-50 md:left-[17rem] md:right-6">
      <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-shell shadow-2xl md:h-[108px]">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent-fill/60 to-transparent" />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,color-mix(in_oklab,var(--primary)_10%,transparent),transparent_34%)]" />
        <div className="relative flex flex-col gap-3 px-4 py-3 text-zinc-100 md:h-full md:flex-row md:items-center md:gap-4 md:px-5 md:py-3">
          <div className="flex items-center gap-3 md:gap-4">
            <Button
              size="icon"
              onClick={onTogglePlayback}
              className="h-16 w-16 shrink-0 rounded-full bg-accent-fill text-white shadow-glow-accent-strong hover:bg-accent-fill-hover md:h-14 md:w-14"
              aria-label={isPlaying ? "Pause audio" : "Play audio"}
            >
              {isPlaying ? (
                <Pause className="size-7 fill-current md:size-6" />
              ) : (
                <Play className="ml-1 size-7 fill-current md:size-6" />
              )}
            </Button>

            <div className="min-w-0 md:hidden">
              <div className="truncate text-base font-semibold text-zinc-50">
                {title || file.filename}
              </div>
            </div>
          </div>

          <div className="min-w-0 flex-1 md:flex md:h-full md:flex-col md:justify-center">
            <div className="mb-2 hidden items-center justify-between gap-3 md:flex">
              <div className="flex min-w-0 items-center gap-2">
                <div className="min-w-0 truncate text-base font-semibold leading-none text-zinc-50">
                  {title || file.filename}
                </div>
                {file.tags.length > 0 ? (
                  <div className="flex shrink-0 items-center gap-1">
                    {file.tags.map((tag) => (
                      <span
                        key={tag.id}
                        className="inline-flex items-center gap-1 rounded-full bg-accent-fill/15 px-1.5 py-0.5 font-mono text-[10px] font-normal text-accent-text ring-1 ring-accent-fill/20"
                      >
                        {tag.name}
                        <button
                          type="button"
                          className="hover:text-destructive"
                          onClick={() => onToggleFileTag?.(file.id, tag.id)}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                ) : null}
                <TagPicker
                  allTags={allTags ?? []}
                  fileTagIds={useMemo(() => new Set(file.tags.map((t) => t.id)), [file])}
                  onToggleTag={(tagId) => onToggleFileTag?.(file.id, tagId)}
                  label="Tags"
                />
              </div>

              <Button
                variant="ghost"
                size="icon"
                onClick={onClose}
                className="size-8 shrink-0 rounded-full text-zinc-400 hover:bg-white/5 hover:text-zinc-100"
                aria-label="Close player"
              >
                <X className="size-3.5" />
              </Button>
            </div>

            <div className="rounded-2xl md:hidden">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="text-xs font-mono text-zinc-400">
                  {formatTime(currentTime)}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onClose}
                  className="size-8 shrink-0 rounded-full text-zinc-400 hover:bg-white/5 hover:text-zinc-100"
                  aria-label="Close player"
                >
                  <X className="size-4" />
                </Button>
                <div className="text-xs font-mono text-zinc-400">
                  {formatTime(effectiveDuration)}
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/5 px-1 py-1 md:border-none md:bg-transparent md:px-0 md:py-0">
              <AudioScrubber
                data={waveformData}
                currentTime={currentTime}
                duration={Math.max(effectiveDuration, 1)}
                onSeek={onSeek}
                height={34}
                barWidth={3}
                barGap={1}
                barRadius={999}
                barHeight={3}
                showHandle={false}
                barColor="var(--accent-fill)"
                className="w-full overflow-hidden"
              />
            </div>

            <div className="mt-0.5 flex items-center justify-between text-[10px] font-mono text-zinc-400 md:hidden">
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(effectiveDuration)}</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 md:flex-nowrap md:self-center">
            <AudioPlayerFavoriteButton
              fileId={file.id}
              isFavorite={file.isFavorite}
              onToggleFavorite={onToggleFavorite}
            />

            <AudioPlayerCollectionMenu
              collections={collections}
              onAddToCollection={onAddToCollection}
            />

            <AudioPlayerVolumeControl
              isMuted={isMuted}
              onToggleMuted={onToggleMuted}
              onVolumeChange={onVolumeChange}
              volume={volume}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
