"use client";

import { useMemo } from "react";
import {
  FolderPlus,
  Heart,
  Pause,
  Play,
  Repeat,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";

import { Waveform } from "@/components/ui/waveform";

function peaksFor(seed: number, count = 96): number[] {
  return Array.from({ length: count }, (_, i) => {
    const v = Math.abs(Math.sin(i * 12.9898 + seed * 78.233) * 43758.5453) % 1;
    return 0.08 + v * 0.92;
  });
}

export function FloatingConsole({
  filename,
  meta,
  elapsed,
  total,
  progress,
  isPlaying,
  isFavorite,
  isMuted,
  autoplay,
  onTogglePlayback,
  onNext,
  onPrev,
  onSeek,
  onToggleFavorite,
  onOpenCollections,
  onToggleMuted,
  onToggleAutoplay,
  onClose,
}: {
  filename: string;
  meta: string;
  elapsed: string;
  total: string;
  progress: number;
  isPlaying: boolean;
  isFavorite: boolean;
  isMuted: boolean;
  autoplay: boolean;
  onTogglePlayback: () => void;
  onNext: () => void;
  onPrev: () => void;
  onSeek: (fraction: number) => void;
  onToggleFavorite: () => void;
  onOpenCollections: () => void;
  onToggleMuted: () => void;
  onToggleAutoplay: () => void;
  onClose: () => void;
}) {
  const peaks = useMemo(() => peaksFor(filename.length * 31 + 7), [filename]);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-30 flex justify-center px-4">
      <div className="pointer-events-auto w-full max-w-3xl rounded-[32px] border border-white/10 bg-shell/90 px-5 py-4 shadow-glow-overlay backdrop-blur-2xl">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onPrev}
              aria-label="Previous in queue"
              className="flex size-8 items-center justify-center rounded-full text-zinc-400 transition-colors hover:bg-white/10 hover:text-zinc-100"
            >
              <SkipBack className="size-4" />
            </button>
            <button
              type="button"
              onClick={onTogglePlayback}
              aria-label={isPlaying ? "Pause" : "Play"}
              className="flex size-10 items-center justify-center rounded-full bg-accent-fill text-white shadow-glow-accent-strong transition-all hover:bg-accent-fill-hover"
            >
              {isPlaying ? <Pause className="size-4" /> : <Play className="ml-0.5 size-4" />}
            </button>
            <button
              type="button"
              onClick={onNext}
              aria-label="Next in queue"
              className="flex size-8 items-center justify-center rounded-full text-zinc-400 transition-colors hover:bg-white/10 hover:text-zinc-100"
            >
              <SkipForward className="size-4" />
            </button>
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-semibold leading-tight text-zinc-100">
              {filename}
              <span className="ml-2 font-mono text-[11px] font-normal text-zinc-500">{meta}</span>
            </span>
            <span className="mt-1.5 block h-[26px]">
              <Waveform
                data={peaks}
                height={26}
                barWidth={3}
                barGap={1}
                barRadius={999}
                barColor="var(--accent-fill)"
                progress={progress}
                glow
                fadeEdges={false}
                className="w-full"
                onBarClick={(_, value) => onSeek(value)}
              />
            </span>
          </span>
          <span className="shrink-0 font-mono text-[11px] tabular-nums text-zinc-400">
            {elapsed} / {total}
          </span>
        </div>
        <div className="mt-2.5 flex items-center gap-1.5 border-t border-white/5 pt-2.5">
          <button
            type="button"
            onClick={onToggleFavorite}
            aria-label={isFavorite ? "Unsave" : "Save to favorites"}
            className={`flex size-8 items-center justify-center rounded-full transition-colors hover:bg-white/10 ${isFavorite ? "text-accent-fill" : "text-zinc-400 hover:text-zinc-100"}`}
          >
            <Heart className={`size-4 ${isFavorite ? "fill-current" : ""}`} />
          </button>
          <button
            type="button"
            onClick={onOpenCollections}
            aria-label="Add to collection"
            title="Add to collection"
            className="flex size-8 items-center justify-center rounded-full text-zinc-400 transition-colors hover:bg-white/10 hover:text-zinc-100"
          >
            <FolderPlus className="size-4" />
          </button>
          <button
            type="button"
            onClick={onToggleMuted}
            aria-label={isMuted ? "Unmute" : "Mute"}
            className="flex size-8 items-center justify-center rounded-full text-zinc-400 transition-colors hover:bg-white/10 hover:text-zinc-100"
          >
            {isMuted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
          </button>
          <button
            type="button"
            onClick={onToggleAutoplay}
            aria-label={autoplay ? "Turn autoplay off" : "Turn autoplay on"}
            aria-pressed={autoplay}
            title={autoplay ? "Autoplay on" : "Autoplay off"}
            className={`flex size-8 items-center justify-center rounded-full transition-colors hover:bg-white/10 ${autoplay ? "text-accent-text" : "text-zinc-400 hover:text-zinc-100"}`}
          >
            <Repeat className="size-4" />
          </button>
          <span className="flex-1" />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close player"
            className="flex size-8 items-center justify-center rounded-full text-zinc-500 transition-colors hover:bg-white/5 hover:text-zinc-200"
          >
            <X className="size-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
