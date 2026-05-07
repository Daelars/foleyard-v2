"use client";

import { Pause, Play, X } from "lucide-react";

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
}: {
  collections: { id: string; name: string; fileCount?: number }[];
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
}) {
  return (
    <div className="fixed inset-x-4 bottom-4 z-50 md:left-[17rem] md:right-6">
      <div className="relative overflow-hidden rounded-2xl border border-border/40 bg-card/80 shadow-2xl backdrop-blur-2xl md:h-[108px]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,color-mix(in_oklab,var(--primary)_10%,transparent),transparent_34%)]" />
        <div className="relative flex flex-col gap-3 px-4 py-3 text-card-foreground md:h-full md:flex-row md:items-center md:gap-4 md:px-5 md:py-3">
          <div className="flex items-center gap-3 md:gap-4">
            <Button
              size="icon"
              onClick={onTogglePlayback}
              className="h-16 w-16 shrink-0 rounded-full border border-border/40 bg-primary text-primary-foreground shadow-lg backdrop-blur-md hover:bg-primary/90 md:h-14 md:w-14"
              aria-label={isPlaying ? "Pause audio" : "Play audio"}
            >
              {isPlaying ? (
                <Pause className="size-7 fill-current md:size-6" />
              ) : (
                <Play className="ml-1 size-7 fill-current md:size-6" />
              )}
            </Button>

            <div className="min-w-0 md:hidden">
              <div className="truncate text-base font-semibold text-card-foreground">
                {title || file.filename}
              </div>
            </div>
          </div>

          <div className="min-w-0 flex-1 md:flex md:h-full md:flex-col md:justify-center">
            <div className="mb-2 hidden items-center justify-between gap-3 md:flex">
              <div className="min-w-0 truncate text-base font-semibold leading-none text-card-foreground">
                {title || file.filename}
              </div>

              <Button
                variant="ghost"
                size="icon"
                onClick={onClose}
                className="size-8 shrink-0 rounded-full text-muted-foreground"
                aria-label="Close player"
              >
                <X className="size-3.5" />
              </Button>
            </div>

            <div className="rounded-2xl md:hidden">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="text-xs font-mono text-muted-foreground">
                  {formatTime(currentTime)}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onClose}
                  className="size-8 shrink-0 rounded-full text-muted-foreground"
                  aria-label="Close player"
                >
                  <X className="size-4" />
                </Button>
                <div className="text-xs font-mono text-muted-foreground">
                  {formatTime(effectiveDuration)}
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-border/40 bg-muted/50 px-1 py-1 md:border-none md:bg-transparent md:px-0 md:py-0">
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
                barColor="var(--primary)"
                className="w-full overflow-hidden"
              />
            </div>

            <div className="mt-0.5 flex items-center justify-between text-[10px] font-mono text-muted-foreground md:hidden">
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
