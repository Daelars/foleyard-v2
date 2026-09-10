"use client";

// app-v3 adapter for AudioPlayer: identical props/ref contract, real audio
// via the shipped useAudioPlayback engine, I transport treatment (red disc
// play button, glow shell, bar scrubber, glass volume slider, collection
// popup, favorite/autoplay/dismiss).
import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from "react";
import { FolderOpen, Heart, Repeat, SkipBack, SkipForward, Volume2, VolumeX, X } from "lucide-react";

import {
  Button,
  IconButton,
  Menu,
  MenuItem,
  MenuSeparator,
  PlayButton,
  Scrubber,
  Slider,
  TransportPanel,
} from "@/components/variant-i";
import { useAudioPlayback } from "@/components/AudioPlayer/use-audio-playback";
import type {
  AudioPlayerProps,
  AudioPlayerRef,
} from "@/components/AudioPlayer/types";
import { formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export type { AudioPlayerProps, AudioPlayerRef } from "@/components/AudioPlayer/types";

/** Transport scrubber bar pitch in px: 2px bar + 2px gap, like the specimen. */
const BAR_PITCH = 4;

/**
 * Width-adaptive bar buckets for the scrubber: downsamples the full
 * 512-sample peaks to the available track width (barCount = width / 4px),
 * the same strategy the file-row waveform uses, so the transport shows the
 * same waveform shape as the row at any window size.
 */
function useAdaptivePeaks(data: readonly number[], trackRef: React.RefObject<HTMLDivElement | null>) {
  const [trackWidth, setTrackWidth] = useState(0);

  useLayoutEffect(() => {
    const node = trackRef.current;
    if (!node) return;
    const measure = () => setTrackWidth(node.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [trackRef]);

  return useMemo(() => {
    if (data.length === 0) return [];
    const max = Math.max(1, ...data);
    const normalized = data.map((peak) => Math.min(1, peak / max));
    const barCount = Math.max(16, Math.min(256, Math.floor((trackWidth || 1) / BAR_PITCH)));
    if (normalized.length <= barCount) return normalized;
    const bucket = normalized.length / barCount;
    return Array.from({ length: barCount }, (_, index) => {
      const start = Math.floor(index * bucket);
      const end = Math.floor((index + 1) * bucket);
      let peak = 0;
      for (let i = start; i < end; i += 1) {
        const value = normalized[i] ?? 0;
        if (value > peak) peak = value;
      }
      return peak;
    });
  }, [data, trackWidth]);
}

export const V3AudioPlayer = forwardRef<AudioPlayerRef, AudioPlayerProps>(
  function V3AudioPlayer(
    {
      selectedFile,
      onClose,
      onPlaybackChange,
      onEnded,
      onNext,
      onPrev,
      autoplay,
      onToggleAutoplay,
      nextTitle,
      onToggleFavorite,
      collections,
      onAddToCollection,
      onCreateCollection,
    },
    ref,
  ) {
    if (!selectedFile) {
      return null;
    }

    return (
      <V3AudioPlayerContent
        ref={ref}
        key={selectedFile.id}
        selectedFile={selectedFile}
        onClose={onClose}
        onPlaybackChange={onPlaybackChange}
        onEnded={onEnded}
        onNext={onNext}
        onPrev={onPrev}
        autoplay={autoplay}
        onToggleAutoplay={onToggleAutoplay}
        nextTitle={nextTitle}
        onToggleFavorite={onToggleFavorite}
        collections={collections}
        onAddToCollection={onAddToCollection}
        onCreateCollection={onCreateCollection}
      />
    );
  },
);

const V3AudioPlayerContent = forwardRef<
  AudioPlayerRef,
  Omit<AudioPlayerProps, "selectedFile"> & {
    selectedFile: NonNullable<AudioPlayerProps["selectedFile"]>;
  }
>(function V3AudioPlayerContent(
  {
    selectedFile,
    onClose,
    onPlaybackChange,
    onEnded,
    onNext,
    onPrev,
    autoplay,
    onToggleAutoplay,
    nextTitle,
    onToggleFavorite,
    collections,
    onAddToCollection,
    onCreateCollection,
  },
  ref,
) {
  const playback = useAudioPlayback(selectedFile, onPlaybackChange, onEnded);

  useImperativeHandle(ref, () => ({
    togglePlayback: playback.togglePlayback,
  }));

  const scrubberTrackRef = useRef<HTMLDivElement>(null);

  // Same 512-sample peaks as the file row, decimated to the transport
  // track width so both render the same waveform shape.
  const peaks = useAdaptivePeaks(playback.waveformData, scrubberTrackRef);

  const [collOpen, setCollOpen] = useState(false);
  const [collPos, setCollPos] = useState<{ top: number; left: number } | null>(null);
  const collTriggerRef = useRef<HTMLButtonElement>(null);
  const collMenuRef = useRef<HTMLDivElement>(null);

  const measureCollMenu = useCallback(() => {
    const trigger = collTriggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    setCollPos({ top: rect.bottom + 6, left: Math.max(8, rect.right - 240) });
  }, []);

  useEffect(() => {
    if (!collOpen) return;
    measureCollMenu();
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!collTriggerRef.current?.contains(target) && !collMenuRef.current?.contains(target)) {
        setCollOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setCollOpen(false);
        collTriggerRef.current?.focus();
      }
    };
    const onReposition = () => measureCollMenu();
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", onReposition, true);
    window.addEventListener("resize", onReposition);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", onReposition, true);
      window.removeEventListener("resize", onReposition);
    };
  }, [collOpen, measureCollMenu]);

  const meta = useMemo(() => {
    const parts: string[] = [];
    if (selectedFile.format) {
      parts.push(selectedFile.format);
    }
    if (nextTitle) {
      parts.push(`next: ${nextTitle}`);
    }
    return parts.join(" · ");
  }, [selectedFile.format, nextTitle]);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-30 flex justify-center px-4">
      <div className="pointer-events-auto w-full max-w-3xl">
        <TransportPanel>
          <div className="flex items-center gap-3">
            <div className="flex shrink-0 items-center gap-1">
              <Button
                tone="ghost"
                size="icon"
                className="size-8 rounded-full"
                aria-label="Previous in queue"
                onClick={onPrev}
              >
                <SkipBack fill="currentColor" className="size-4" />
              </Button>
              <PlayButton
                playing={playback.isPlaying}
                label={playback.isPlaying ? "Pause audio" : "Play audio"}
                onClick={playback.togglePlayback}
              />
              <Button
                tone="ghost"
                size="icon"
                className="size-8 rounded-full"
                aria-label="Next in queue"
                onClick={onNext}
              >
                <SkipForward fill="currentColor" className="size-4" />
              </Button>
            </div>

            <div ref={scrubberTrackRef} className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold leading-tight text-zinc-100">
                {playback.title || selectedFile.filename}
                {meta ? (
                  <span className="ml-2 font-mono text-[11px] font-normal text-zinc-500">
                    {meta}
                  </span>
                ) : null}
              </p>
              <Scrubber
                peaks={peaks}
                progress={Math.max(0, Math.min(1, playback.currentTime / Math.max(playback.effectiveDuration, 1)))}
                duration={Math.max(playback.effectiveDuration, 1)}
                onSeek={playback.handleSeek}
                label={`Seek through ${selectedFile.filename}`}
              />
            </div>

            <span className="hidden shrink-0 font-mono text-[11px] tabular-nums text-zinc-400 sm:block">
              {formatTime(playback.currentTime)} / {formatTime(playback.effectiveDuration)}
            </span>
          </div>

          <div className="mt-2.5 flex flex-wrap items-center gap-1 border-t border-white/[0.06] pt-2.5">
            <IconButton
              label={selectedFile.isFavorite ? "Unlike file" : "Like file"}
              tone={selectedFile.isFavorite ? "danger" : "secondary"}
              aria-pressed={selectedFile.isFavorite}
              onClick={() => void onToggleFavorite(selectedFile.id)}
              className="size-9 rounded-full"
            >
              <Heart
                fill={selectedFile.isFavorite ? "currentColor" : "none"}
                className={selectedFile.isFavorite ? "text-accent-text" : undefined}
              />
            </IconButton>
            <button
              ref={collTriggerRef}
              type="button"
              aria-label="Add to collection"
              aria-haspopup="menu"
              aria-expanded={collOpen}
              title="Add to collection"
              onClick={() => {
                if (collOpen) setCollOpen(false);
                else {
                  measureCollMenu();
                  setCollOpen(true);
                }
              }}
              className="grid size-8 shrink-0 place-items-center rounded-full border border-transparent text-zinc-400 outline-none transition-[background-color,border-color,box-shadow,color,transform] duration-150 hover:border-[var(--vi-edge)] hover:bg-white/[0.06] hover:text-zinc-100 motion-safe:hover:-translate-y-px motion-safe:active:scale-95 focus-visible:ring-2 focus-visible:ring-[color-mix(in_oklab,var(--accent-fill)_55%,transparent)] motion-reduce:transition-none [&_svg]:size-4"
            >
              <FolderOpen />
            </button>
            <div className="flex w-28 shrink-0 items-center gap-1">
              <Button
                tone="ghost"
                size="icon"
                className="size-8 rounded-full"
                aria-label={playback.isMuted || playback.volume === 0 ? "Unmute audio" : "Mute audio"}
                onClick={() => playback.setIsMuted((current) => !current)}
              >
                {playback.isMuted || playback.volume === 0 ? <VolumeX /> : <Volume2 />}
              </Button>
              <div className="min-w-0 flex-1">
                <Slider
                  label="Volume"
                  value={playback.isMuted ? 0 : playback.volume}
                  min={0}
                  max={1}
                  step={0.01}
                  onChange={(next) => playback.handleVolumeChange(next)}
                  formatValue={(next) => `${Math.round(next * 100)}%`}
                />
              </div>
            </div>
            <Button
              tone="ghost"
              size="icon"
              className="size-8 rounded-full"
              aria-label={autoplay ? "Turn autoplay off" : "Turn autoplay on"}
              aria-pressed={autoplay}
              title={autoplay ? "Autoplay on" : "Autoplay off"}
              onClick={() => onToggleAutoplay(!autoplay)}
            >
              <Repeat className={cn(autoplay && "text-accent-text")} />
            </Button>
            <span className="flex-1" />
            {autoplay ? (
              <span className="hidden font-mono text-[10px] uppercase tracking-[0.12em] text-accent-text min-[560px]:block">
                Auto
              </span>
            ) : null}
            <Button
              tone="ghost"
              size="icon"
              className="size-8 rounded-full [&_svg]:size-3.5"
              aria-label="Close player"
              onClick={onClose}
            >
              <X />
            </Button>
          </div>
        </TransportPanel>
      </div>

      {collOpen && collPos ? (
        <div
          ref={collMenuRef}
          role="menu"
          aria-label="Collections"
          style={{ top: collPos.top, left: collPos.left }}
          className="fixed z-[70] w-60 [animation:vi-menu-in_0.14s_ease-out] motion-reduce:[animation:none]"
        >
          <Menu label="Collections">
            {collections.length === 0 ? (
              <MenuItem disabled>No collections yet.</MenuItem>
            ) : (
              collections.map((collection) => (
                <MenuItem
                  key={collection.id}
                  icon={collection.isSmart ? <SparklesGlyph /> : <FolderOpen />}
                  meta={
                    collection.isSmart
                      ? "Smart"
                      : typeof collection.fileCount === "number"
                        ? collection.fileCount
                        : undefined
                  }
                  onClick={() => {
                    setCollOpen(false);
                    void onAddToCollection(collection.id);
                  }}
                >
                  {collection.name}
                </MenuItem>
              ))
            )}
            {onCreateCollection ? (
              <>
                <MenuSeparator />
                <MenuItem
                  icon={<PlusGlyph />}
                  onClick={() => {
                    setCollOpen(false);
                    onCreateCollection();
                  }}
                >
                  New collection…
                </MenuItem>
              </>
            ) : null}
          </Menu>
        </div>
      ) : null}
    </div>
  );
});

function SparklesGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8" />
    </svg>
  );
}

function PlusGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}