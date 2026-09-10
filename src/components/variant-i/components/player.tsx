"use client";

import type { ReactNode } from "react";
import { useRef } from "react";

import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Slider — inset track, red fill with glow, glass thumb. Pointer drag plus
// full keyboard support via a real slider role.
// ---------------------------------------------------------------------------

export function Slider({
  label,
  value,
  min = 0,
  max = 100,
  step = 1,
  onChange,
  formatValue,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange?: (value: number) => void;
  formatValue?: (value: number) => string;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const pct = Math.min(1, Math.max(0, (value - min) / (max - min || 1)));
  const text = formatValue ? formatValue(value) : `${Math.round(value)}`;

  const setFromClientX = (clientX: number) => {
    const track = trackRef.current;
    if (!track) return;
    const rect = track.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const raw = min + ratio * (max - min);
    onChange?.(Math.min(max, Math.max(min, Math.round(raw / step) * step)));
  };

  return (
    <div className="flex items-center gap-3">
      <div
        ref={trackRef}
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={text}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          setFromClientX(event.clientX);
          const onMove = (moveEvent: PointerEvent) => setFromClientX(moveEvent.clientX);
          const onUp = () => {
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("pointerup", onUp);
          };
          window.addEventListener("pointermove", onMove);
          window.addEventListener("pointerup", onUp);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
            event.preventDefault();
            onChange?.(Math.max(min, value - step));
          } else if (event.key === "ArrowRight" || event.key === "ArrowUp") {
            event.preventDefault();
            onChange?.(Math.min(max, value + step));
          } else if (event.key === "Home") {
            event.preventDefault();
            onChange?.(min);
          } else if (event.key === "End") {
            event.preventDefault();
            onChange?.(max);
          }
        }}
        className="group relative flex h-6 min-w-0 flex-1 cursor-pointer touch-none items-center outline-none"
      >
        <span className="relative h-1 w-full overflow-visible rounded-full bg-white/10 shadow-[inset_0_1px_2px_rgba(0,0,0,0.5)]">
          <span
            aria-hidden
            className="absolute inset-y-0 left-0 rounded-full bg-[linear-gradient(90deg,color-mix(in_oklab,var(--accent-fill)_70%,transparent),var(--accent-fill))] shadow-[0_0_10px_color-mix(in_oklab,var(--accent-fill)_35%,transparent)]"
            style={{ width: `${pct * 100}%` }}
          />
        </span>
        <span
          aria-hidden
          className={cn(
            "absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-black/50",
            "bg-[linear-gradient(180deg,#ffffff,#d4d4d8)]",
            "shadow-[0_1px_3px_rgba(0,0,0,0.6),0_0_0_0_transparent]",
            "transition-[box-shadow,scale] duration-150 motion-reduce:transition-none",
            "group-hover:scale-110 group-focus-visible:shadow-[0_0_0_3px_color-mix(in_oklab,var(--accent-fill)_35%,transparent)] group-focus-visible:outline-none group-active:scale-95",
          )}
          style={{ left: `${pct * 100}%` }}
        />
      </div>
      <span className="w-11 shrink-0 text-right font-mono text-[11px] tabular-nums text-zinc-400">
        {text}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Scrubber — the shell's seek bar as a bar strip: played bars in glowing
// accent, the rest dimmed, with a playhead knob that reveals on hover and
// focus. Click/drag seeks; arrows nudge by a second.
// ---------------------------------------------------------------------------

function fmtClock(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function Scrubber({
  peaks,
  progress,
  duration,
  onSeek,
  label,
}: {
  peaks: ReadonlyArray<number>;
  progress: number;
  duration: number;
  onSeek: (time: number) => void;
  label: string;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const current = progress * duration;

  const setFromClientX = (clientX: number) => {
    const track = trackRef.current;
    if (!track) return;
    const rect = track.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    onSeek(ratio * duration);
  };

  return (
    <div
      ref={trackRef}
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={Math.round(duration)}
      aria-valuenow={Math.round(current)}
      aria-valuetext={`${fmtClock(current)} of ${fmtClock(duration)}`}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        setFromClientX(event.clientX);
        const onMove = (moveEvent: PointerEvent) => setFromClientX(moveEvent.clientX);
        const onUp = () => {
          window.removeEventListener("pointermove", onMove);
          window.removeEventListener("pointerup", onUp);
        };
        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
      }}
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
          event.preventDefault();
          onSeek(Math.max(0, current - 1));
        } else if (event.key === "ArrowRight" || event.key === "ArrowUp") {
          event.preventDefault();
          onSeek(Math.min(duration, current + 1));
        } else if (event.key === "Home") {
          event.preventDefault();
          onSeek(0);
        } else if (event.key === "End") {
          event.preventDefault();
          onSeek(duration);
        }
      }}
      className="group relative flex h-7 cursor-pointer touch-none items-center outline-none"
    >
      <div aria-hidden className="flex h-full w-full items-center gap-[2px]">
        {peaks.map((peak, index) => {
          const played = index / peaks.length <= progress;
          return (
            <span
              key={index}
              className={cn(
                "w-full min-w-[2px] rounded-full transition-[background-color] duration-100",
                played
                  ? "bg-[linear-gradient(180deg,color-mix(in_oklab,var(--accent-fill)_85%,white_8%),color-mix(in_oklab,var(--accent-fill)_60%,transparent))]"
                  : "bg-white/10 group-hover:bg-white/20",
              )}
              style={{ height: `${Math.round(peak * 100)}%` }}
            />
          );
        })}
      </div>
      <span
        aria-hidden
        className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white opacity-0 shadow-[0_0_10px_rgba(255,255,255,0.7)] transition-opacity duration-150 group-focus-visible:opacity-100 group-hover:opacity-100 motion-reduce:transition-none"
        style={{ left: `${Math.min(100, Math.max(0, progress * 100))}%` }}
      />
    </div>
  );
}

/** Waveform — transport strip: played bars in accent, the rest dimmed. */
export function Waveform({ peaks, progress }: { peaks: ReadonlyArray<number>; progress: number }) {
  return (
    <div aria-hidden className="flex h-12 min-w-0 flex-1 items-center gap-[2px]">
      {peaks.map((peak, index) => {
        const played = index / peaks.length <= progress;
        return (
          <span
            key={index}
            className={cn(
              "w-full min-w-[2px] rounded-full",
              played
                ? "bg-[linear-gradient(180deg,color-mix(in_oklab,var(--accent-fill)_85%,white_8%),color-mix(in_oklab,var(--accent-fill)_60%,transparent))]"
                : "bg-zinc-700/60",
            )}
            style={{ height: `${Math.round(peak * 100)}%` }}
          />
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Transport panel — the player shell, redesigned. The app keeps its own
// placement; this is the shared surface construction.
// ---------------------------------------------------------------------------

export function TransportPanel({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-[20px] border border-[var(--vi-edge-hi)] bg-[#101014]/95 px-4 py-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_20px_50px_rgba(0,0,0,0.6),0_0_44px_color-mix(in_oklab,var(--accent-fill)_8%,transparent)]",
        className,
      )}
    >
      {children}
    </div>
  );
}