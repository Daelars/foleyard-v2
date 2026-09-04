"use client";

import { forwardRef, useImperativeHandle } from "react";

import { AudioPlayerShell } from "@/components/AudioPlayer/player-shell";
import type {
  AudioPlayerProps,
  AudioPlayerRef,
} from "@/components/AudioPlayer/types";
import { useAudioPlayback } from "@/components/AudioPlayer/use-audio-playback";

export type { AudioPlayerProps, AudioPlayerRef } from "@/components/AudioPlayer/types";

export const AudioPlayer = forwardRef<AudioPlayerRef, AudioPlayerProps>(
  function AudioPlayer(
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
    },
    ref,
  ) {
    if (!selectedFile) {
      return null;
    }

    return (
      <AudioPlayerContent
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
      />
    );
  },
);

const AudioPlayerContent = forwardRef<
  AudioPlayerRef,
  Omit<AudioPlayerProps, "selectedFile"> & {
    selectedFile: NonNullable<AudioPlayerProps["selectedFile"]>;
  }
>(
  function AudioPlayerContent(
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
    },
    ref,
  ) {
    const playback = useAudioPlayback(selectedFile, onPlaybackChange, onEnded);

    useImperativeHandle(ref, () => ({
      togglePlayback: playback.togglePlayback,
    }));

    return (
      <AudioPlayerShell
        collections={collections}
        currentTime={playback.currentTime}
        effectiveDuration={playback.effectiveDuration}
        file={selectedFile}
        isMuted={playback.isMuted}
        isPlaying={playback.isPlaying}
        autoplay={autoplay}
        nextTitle={nextTitle}
        onAddToCollection={onAddToCollection}
        onClose={onClose}
        onNext={onNext}
        onPrev={onPrev}
        onSeek={playback.handleSeek}
        onToggleAutoplay={onToggleAutoplay}
        onToggleFavorite={onToggleFavorite}
        onToggleMuted={() => playback.setIsMuted((current) => !current)}
        onTogglePlayback={playback.togglePlayback}
        onVolumeChange={playback.handleVolumeChange}
        title={playback.title}
        volume={playback.volume}
        waveformData={playback.waveformData}
      />
    );
  },
);
