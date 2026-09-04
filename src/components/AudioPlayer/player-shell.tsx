"use client";

import { useMemo } from "react";
import { Pause, Play, Repeat, SkipBack, SkipForward, X } from "lucide-react";

import { TagPicker, type TagItem } from "@/components/TagPicker";
import { AudioScrubber } from "@/components/ui/waveform";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

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
  autoplay,
  nextTitle,
  onAddToCollection,
  onClose,
  onNext,
  onPrev,
  onSeek,
  onToggleAutoplay,
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
  autoplay: boolean;
  nextTitle?: string | null;
  onAddToCollection: (collectionId: string) => Promise<void>;
  onClose: () => void;
  onNext: () => void;
  onPrev: () => void;
  onSeek: (time: number) => void;
  onToggleAutoplay: (checked: boolean) => void;
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
  const meta = useMemo(() => {
    const parts = [
      file.format ?? undefined,
      ...file.tags.map((tag) => tag.name),
    ].filter((part): part is string => Boolean(part));

    if (nextTitle) {
      parts.push(`next: ${nextTitle}`);
    }

    return parts.join(" · ");
  }, [file.format, file.tags, nextTitle]);

  const fileTagIds = useMemo(
    () => new Set(file.tags.map((t) => t.id)),
    [file],
  );

  return (
    <footer className="relative shrink-0 border-t border-white/10">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent-fill/60 to-transparent" />
      <div className="flex w-full flex-col gap-2 px-4 py-2.5 md:flex-row md:items-center md:gap-3 md:px-5">
        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="icon"
            onClick={onPrev}
            className="size-8 shrink-0 rounded-full text-zinc-400 hover:bg-white/10 hover:text-zinc-100"
            aria-label="Previous in queue"
          >
            <SkipBack className="size-4" />
          </Button>
          <Button
            size="icon"
            onClick={onTogglePlayback}
            className="size-10 shrink-0 rounded-full bg-accent-fill text-white shadow-glow-accent-strong hover:bg-accent-fill-hover"
            aria-label={isPlaying ? "Pause audio" : "Play audio"}
          >
            {isPlaying ? (
              <Pause className="size-4 fill-current" />
            ) : (
              <Play className="ml-0.5 size-4 fill-current" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onNext}
            className="size-8 shrink-0 rounded-full text-zinc-400 hover:bg-white/10 hover:text-zinc-100"
            aria-label="Next in queue"
          >
            <SkipForward className="size-4" />
          </Button>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <p className="truncate text-[13px] font-semibold leading-tight text-zinc-100">
              {title || file.filename}
            </p>
            {meta ? (
              <span className="hidden min-w-0 flex-1 truncate font-mono text-[11px] font-normal text-zinc-500 sm:block">
                {meta}
              </span>
            ) : null}
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="ml-auto size-7 shrink-0 rounded-full text-zinc-500 hover:bg-white/5 hover:text-zinc-200 sm:ml-0"
              aria-label="Close player"
            >
              <X className="size-3.5" />
            </Button>
          </div>
          {file.tags.length > 0 ? (
            <div className="mt-1 flex items-center gap-1">
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
              <TagPicker
                allTags={allTags ?? []}
                fileTagIds={fileTagIds}
                onToggleTag={(tagId) => onToggleFileTag?.(file.id, tagId)}
                label="Tags"
              />
            </div>
          ) : (
            <div className="mt-1">
              <TagPicker
                allTags={allTags ?? []}
                fileTagIds={fileTagIds}
                onToggleTag={(tagId) => onToggleFileTag?.(file.id, tagId)}
                label="Tags"
              />
            </div>
          )}
          <div className="mt-1">
            <AudioScrubber
              data={waveformData}
              currentTime={currentTime}
              duration={Math.max(effectiveDuration, 1)}
              onSeek={onSeek}
              height={26}
              barWidth={3}
              barGap={1}
              barRadius={999}
              barHeight={3}
              showHandle={false}
              barColor="var(--accent-fill)"
              className="w-full overflow-hidden"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="hidden shrink-0 font-mono text-[11px] tabular-nums text-zinc-400 sm:block">
            {formatTime(currentTime)} / {formatTime(effectiveDuration)}
          </span>
          <span className="shrink-0 font-mono text-[11px] tabular-nums text-zinc-400 sm:hidden">
            {formatTime(currentTime)}
          </span>
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
          <label className="flex shrink-0 cursor-pointer items-center gap-1.5" title="Autoplay queue">
            <Repeat
              className={autoplay ? "size-3.5 text-accent-text" : "size-3.5 text-zinc-600"}
            />
            <Switch
              checked={autoplay}
              onCheckedChange={onToggleAutoplay}
              aria-label="Autoplay queue"
            />
          </label>
        </div>
      </div>
    </footer>
  );
}
