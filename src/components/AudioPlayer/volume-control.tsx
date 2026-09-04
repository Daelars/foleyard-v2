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
    <div className="flex w-24 items-center gap-1.5">
      <Button
        variant="ghost"
        size="icon"
        className="size-8 shrink-0 rounded-full text-zinc-400 hover:bg-white/10 hover:text-zinc-100"
        onClick={onToggleMuted}
        aria-label={isMuted ? "Unmute audio" : "Mute audio"}
      >
        {isMuted || volume === 0 ? (
          <VolumeX className="size-4" />
        ) : (
          <Volume2 className="size-4" />
        )}
      </Button>
      <Slider
        value={[isMuted ? 0 : volume]}
        min={0}
        max={1}
        step={0.01}
        onValueChange={onVolumeChange}
        aria-label="Volume"
        className="min-w-0 flex-1"
      />
    </div>
  );
}
