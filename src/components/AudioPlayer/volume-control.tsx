"use client";

import { Volume2, VolumeX } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";

export function AudioPlayerVolumeControl({
  isMuted,
  onToggleMuted,
  onVolumeChange,
  volume,
}: {
  isMuted: boolean;
  onToggleMuted: () => void;
  onVolumeChange: (value: number | readonly number[]) => void;
  volume: number;
}) {
  return (
    <div className="flex min-w-[150px] flex-1 items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 md:min-w-[160px] md:flex-none">
      <Button
        variant="ghost"
        size="icon"
        className="size-6 shrink-0 rounded-full text-zinc-400 hover:bg-white/[0.08] hover:text-zinc-100"
        onClick={onToggleMuted}
        aria-label={isMuted ? "Unmute audio" : "Mute audio"}
      >
        {isMuted || volume === 0 ? (
          <VolumeX className="size-3.5" />
        ) : (
          <Volume2 className="size-3.5" />
        )}
      </Button>
      <Slider
        value={[isMuted ? 0 : volume]}
        min={0}
        max={1}
        step={0.01}
        onValueChange={onVolumeChange}
        aria-label="Volume"
        className="flex-1"
      />
    </div>
  );
}
