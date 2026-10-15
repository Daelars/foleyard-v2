"use client";

import { useMemo } from "react";
import type { AudioPlayerFileRecord, AudioPlayerPreferences } from "./types";
import { useAudioElement } from "./use-audio-element";
import { useWaveformPeaks } from "./use-waveform-peaks";

export function useAudioPlayback(
  selectedFile: AudioPlayerFileRecord,
  preferences: AudioPlayerPreferences,
  onPlaybackChange?: (isPlaying: boolean) => void,
  onEnded?: () => void,
) {
  const playback = useAudioElement(
    selectedFile.id,
    preferences.volume,
    preferences.isMuted,
    onPlaybackChange,
    onEnded,
  );
  const waveformData = useWaveformPeaks(selectedFile);
  const title = useMemo(() => selectedFile.filename.replace(/\.[^.]+$/, ""), [selectedFile.filename]);
  return {
    ...playback,
    ...preferences,
    effectiveDuration: playback.duration || selectedFile.duration || 0,
    title,
    waveformData,
  };
}
