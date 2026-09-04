"use client";

import { useMemo } from "react";
import { Pause, Play, Repeat, SkipBack, SkipForward, X } from "lucide-react";

import { AudioScrubber } from "@/components/ui/waveform";
import { Button } from "@/components/ui/button";

import { formatTime } from "@/lib/format";
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
  onCreateCollection,
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
  onCreateCollection?: () => void;
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
}) {
  const meta = useMemo(() => {
    const parts: string[] = [];
    if (file.format) {
      parts.push(file.format);
    }
    if (nextTitle) {
      parts.push(`next: ${nextTitle}`);
    }

    return parts.join(" · ");
  }, [file.format, nextTitle]);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-30 flex justify-center px-4">
      <div className="pointer-events-auto w-full max-w-3xl rounded-[32px] border border-white/10 bg-shell/90 px-5 py-4 shadow-glow-overlay backdrop-blur-2xl">
        <div className="flex items-center gap-3">
          <div className="flex shrink-0 items-center gap-1.5">
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
                <Pause className="size-4" />
              ) : (
                <Play className="size-4 pl-0.5" />
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
            <p className="truncate text-[13px] font-semibold leading-tight text-zinc-100">
              {title || file.filename}
              {meta ? (
                <span className="ml-2 font-mono text-[11px] font-normal text-zinc-500">
                  {meta}
                </span>
              ) : null}
            </p>
            <div className="mt-1.5">
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

          <span className="hidden shrink-0 font-mono text-[11px] tabular-nums text-zinc-400 sm:block">
            {formatTime(currentTime)} / {formatTime(effectiveDuration)}
          </span>
        </div>

        <div className="mt-2.5 flex flex-wrap items-center gap-1.5 border-t border-white/5 pt-2.5">
          <AudioPlayerFavoriteButton
            fileId={file.id}
            isFavorite={file.isFavorite}
            onToggleFavorite={onToggleFavorite}
          />
          <AudioPlayerCollectionMenu
            collections={collections}
            onAddToCollection={onAddToCollection}
            onCreateCollection={onCreateCollection}
          />
          <AudioPlayerVolumeControl
            isMuted={isMuted}
            onToggleMuted={onToggleMuted}
            onVolumeChange={onVolumeChange}
            volume={volume}
          />
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onToggleAutoplay(!autoplay)}
            className={`size-8 shrink-0 rounded-full hover:bg-white/10 ${autoplay ? "text-accent-text hover:text-accent-text" : "text-zinc-400 hover:text-zinc-100"}`}
            aria-label={autoplay ? "Turn autoplay off" : "Turn autoplay on"}
            aria-pressed={autoplay}
            title={autoplay ? "Autoplay on" : "Autoplay off"}
          >
            <Repeat className="size-4" />
          </Button>
          <span className="flex-1" />
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="size-8 shrink-0 rounded-full text-zinc-500 hover:bg-white/5 hover:text-zinc-200"
            aria-label="Close player"
          >
            <X className="size-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
