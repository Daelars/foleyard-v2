"use client";

import { useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Heart,
  Pause,
  Play,
  Repeat,
  SkipBack,
  SkipForward,
  Volume2,
  X,
} from "lucide-react";

import { MiniBars, VariantFrame } from "./data";

function TransportButtons({ playing = false }: { playing?: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="flex size-8 items-center justify-center rounded-full text-zinc-400">
        <SkipBack className="size-4" />
      </span>
      <span className="flex size-10 items-center justify-center rounded-full bg-accent-fill text-white shadow-glow-accent-strong">
        {playing ? <Pause className="size-4" /> : <Play className="ml-0.5 size-4" />}
      </span>
      <span className="flex size-8 items-center justify-center rounded-full text-zinc-400">
        <SkipForward className="size-4" />
      </span>
    </div>
  );
}

function TitleMeta() {
  return (
    <p className="truncate text-[13px] font-semibold leading-tight text-zinc-100">
      Metal Door Slam
      <span className="ml-2 font-mono text-[11px] font-normal text-zinc-500">
        wav · 96k · stereo · next: Sword Unsheath
      </span>
    </p>
  );
}

function Times() {
  return (
    <span className="shrink-0 font-mono text-[11px] tabular-nums text-zinc-400">
      0:01 / 0:02
    </span>
  );
}

function ConsoleFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-canvas">{children}</div>
  );
}

export function ConsoleDesigns() {
  const [drawerOpen, setDrawerOpen] = useState(true);

  return (
    <div className="space-y-4">
      <VariantFrame id="T-A" name="Prototype footer row" note="Baseline: transport, title + meta, capped wave, mono times.">
        <ConsoleFrame>
          <footer className="relative border-t border-white/10">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent-fill/60 to-transparent" />
            <div className="flex w-full items-center gap-3 px-5 py-2.5">
              <TransportButtons playing />
              <div className="min-w-0 flex-1">
                <TitleMeta />
                <div className="mt-1 max-w-2xl">
                  <div className="h-[26px]">
                    <MiniBars seed={3} active />
                  </div>
                </div>
              </div>
              <Times />
            </div>
          </footer>
        </ConsoleFrame>
      </VariantFrame>

      <VariantFrame id="T-B" name="Floating pill" note="Detached dock: floats over content, everything in one capsule.">
        <div className="rounded-xl bg-canvas px-4 pb-6 pt-10">
          <div className="mx-auto flex w-full max-w-2xl items-center gap-3 rounded-full border border-white/10 bg-shell/95 py-2 pl-3 pr-4 shadow-glow-overlay backdrop-blur-2xl">
            <TransportButtons playing />
            <div className="min-w-0 flex-1">
              <TitleMeta />
            </div>
            <Times />
          </div>
        </div>
      </VariantFrame>

      <VariantFrame id="T-C" name="Split console" note="Taller footer, three zones: transport, big scrubber, meta stack.">
        <ConsoleFrame>
          <footer className="relative border-t border-white/10">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent-fill/60 to-transparent" />
            <div className="flex w-full items-center gap-4 px-5 py-3">
              <TransportButtons playing />
              <div className="h-12 min-w-0 flex-1">
                <MiniBars seed={3} active />
              </div>
              <div className="w-56 shrink-0">
                <TitleMeta />
                <div className="mt-1 flex items-center justify-between gap-2">
                  <Times />
                  <span className="flex items-center gap-2 text-zinc-400">
                    <Heart className="size-4 fill-accent-fill text-accent-fill" />
                    <Repeat className="size-4 text-accent-text" />
                    <Volume2 className="size-4" />
                  </span>
                </div>
              </div>
            </div>
          </footer>
        </ConsoleFrame>
      </VariantFrame>

      <VariantFrame id="T-D" name="Mini bar" note="Smallest possible: play, title, time, expand. Details on demand.">
        <ConsoleFrame>
          <footer className="flex w-full items-center gap-2 border-t border-white/10 px-4 py-1.5">
            <span className="flex size-7 items-center justify-center rounded-full bg-accent-fill text-white">
              <Pause className="size-3" />
            </span>
            <span className="min-w-0 flex-1 truncate text-xs font-medium text-zinc-200">
              Metal Door Slam
            </span>
            <span className="shrink-0 font-mono text-[10px] tabular-nums text-zinc-500">0:01</span>
            <ChevronUp className="size-3.5 shrink-0 text-zinc-500" />
          </footer>
        </ConsoleFrame>
      </VariantFrame>

      <VariantFrame id="T-E" name="Queue drawer" note="Footer grows an Up-next list. Try the chevron.">
        <ConsoleFrame>
          <footer className="relative border-t border-white/10">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent-fill/60 to-transparent" />
            {drawerOpen ? (
              <div className="border-b border-white/5 px-5 py-2">
                <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-600">
                  Up next
                </p>
                {["Sword Unsheath", "Neon Hum Loop", "Gravel Footsteps"].map((name, i) => (
                  <div key={name} className="flex items-center gap-3 py-1.5 text-xs">
                    <span className="font-mono tabular-nums text-zinc-600">{i + 1}</span>
                    <span className={i === 0 ? "font-semibold text-zinc-100" : "text-zinc-400"}>
                      {name}
                    </span>
                    <span className="ml-auto flex items-center gap-2 text-zinc-600">
                      <span className="font-mono text-[10px] tabular-nums">0:0{i + 1}</span>
                      <X className="size-3" />
                    </span>
                  </div>
                ))}
              </div>
            ) : null}
            <div className="flex w-full items-center gap-3 px-5 py-2.5">
              <TransportButtons playing />
              <div className="min-w-0 flex-1">
                <TitleMeta />
                <div className="mt-1 max-w-2xl">
                  <div className="h-[26px]">
                    <MiniBars seed={3} active />
                  </div>
                </div>
              </div>
              <Times />
              <button type="button" onClick={() => setDrawerOpen((open) => !open)} aria-label="Toggle queue">
                <ChevronDown
                  className={`size-4 text-zinc-500 transition-transform ${drawerOpen ? "rotate-180" : ""}`}
                />
              </button>
            </div>
          </footer>
        </ConsoleFrame>
      </VariantFrame>
    </div>
  );
}
