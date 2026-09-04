"use client";

import { FolderPlus, Heart, Pause, Repeat, SkipBack, SkipForward, Volume2, X } from "lucide-react";

import { MiniBars, VariantFrame } from "../showcase/data";

export function ConsoleV2() {
  return (
    <VariantFrame
      id="V2-T"
      name="Full pill, fully rounded"
      note="T-F redrawn as one capsule: rounded-[32px], every control, real scrubber layout."
    >
      <div className="relative overflow-hidden rounded-xl border border-white/10 bg-canvas">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,color-mix(in_oklab,var(--accent-fill)_13%,transparent),transparent_38%)]" />
        <div className="relative px-6 pb-16 pt-8">
          <div className="pointer-events-none select-none opacity-60 blur-[1px]" aria-hidden="true">
            <div className="h-3.5 w-1/4 rounded bg-white/10" />
            <div className="mt-2 h-2.5 w-1/6 rounded bg-white/[0.07]" />
          </div>
        </div>
        <div className="relative mx-auto -mt-10 w-full max-w-3xl px-6 pb-8">
          <div className="rounded-[32px] border border-white/10 bg-shell/90 px-5 py-4 shadow-glow-overlay backdrop-blur-2xl">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1.5">
                <span className="flex size-8 items-center justify-center rounded-full text-zinc-400">
                  <SkipBack className="size-4" />
                </span>
                <span className="flex size-10 items-center justify-center rounded-full bg-accent-fill text-white shadow-glow-accent-strong">
                  <Pause className="size-4" />
                </span>
                <span className="flex size-8 items-center justify-center rounded-full text-zinc-400">
                  <SkipForward className="size-4" />
                </span>
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-semibold leading-tight text-zinc-100">
                  Metal Door Slam
                  <span className="ml-2 font-mono text-[11px] font-normal text-zinc-500">
                    wav · 96k · stereo · next: Sword Unsheath
                  </span>
                </span>
                <span className="mt-1.5 block h-[26px]">
                  <MiniBars seed={3} active />
                </span>
              </span>
              <span className="shrink-0 font-mono text-[11px] tabular-nums text-zinc-400">
                0:01 / 0:02
              </span>
            </div>
            <div className="mt-2.5 flex items-center gap-1.5 border-t border-white/5 pt-2.5">
              <span className="flex size-8 items-center justify-center rounded-full text-zinc-400">
                <Heart className="size-4 fill-accent-fill text-accent-fill" />
              </span>
              <span className="flex size-8 items-center justify-center rounded-full text-zinc-400">
                <FolderPlus className="size-4" />
              </span>
              <span className="flex items-center gap-1.5 text-zinc-400">
                <Volume2 className="size-4" />
                <span className="h-1 w-16 overflow-hidden rounded-full bg-white/10">
                  <span className="block h-full w-3/4 rounded-full bg-zinc-400" />
                </span>
              </span>
              <span className="flex size-8 items-center justify-center rounded-full text-accent-text">
                <Repeat className="size-4" />
              </span>
              <span className="flex-1" />
              <span className="flex size-8 items-center justify-center rounded-full text-zinc-500">
                <X className="size-3.5" />
              </span>
            </div>
          </div>
        </div>
      </div>
    </VariantFrame>
  );
}
