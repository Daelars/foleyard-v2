"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { describeMediaError } from "./playback-error";

export interface PlaybackError {
  message: string;
  code: number | null;
}

export function useAudioElement(
  fileId: string,
  volume: number,
  isMuted: boolean,
  onPlaybackChange?: (isPlaying: boolean) => void,
  onEnded?: () => void,
) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const volumeRef = useRef(0.72);
  const isMutedRef = useRef(false);
  const onEndedRef = useRef(onEnded);

  useEffect(() => {
    onEndedRef.current = onEnded;
  });
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState<PlaybackError | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  useEffect(() => {
    volumeRef.current = volume;
    isMutedRef.current = isMuted;
  }, [isMuted, volume]);

  useEffect(() => {
    let active = true;
    const audio = new Audio(`/api/audio?id=${encodeURIComponent(fileId)}`);
    audio.preload = "metadata";
    audio.volume = isMutedRef.current ? 0 : volumeRef.current;
    audioRef.current = audio;

    const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
    const handleLoadedMetadata = () => {
      setCurrentTime(audio.currentTime || 0);
      setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
    };
    // A late recovery (including our own Retry) clears the last failure.
    const handleCanPlay = () => {
      if (active) setError(null);
    };
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(audio.duration || 0);
      onEndedRef.current?.();
    };
    // Missing files, unsupported codecs, decode failures and network drops all
    // reach the user as a readable, recoverable error instead of a silent stall.
    const handleError = () => {
      if (!active) return;
      setIsPlaying(false);
      setError({
        message: describeMediaError(audio.error),
        code: audio.error?.code ?? null,
      });
    };

    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("canplay", handleCanPlay);
    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("error", handleError);

    audio.play().catch(() => {
      // A genuine media failure also fires `error`, so this only reflects the
      // paused state (for example when the browser blocks autoplay).
      if (active) setIsPlaying(false);
    });

    return () => {
      active = false;
      audio.pause();
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("canplay", handleCanPlay);
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("error", handleError);
      audio.removeAttribute("src");
      audio.load();

      if (audioRef.current === audio) {
        audioRef.current = null;
      }
    };
  }, [fileId, reloadToken]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume;
    }
  }, [isMuted, volume]);

  useEffect(() => {
    onPlaybackChange?.(isPlaying);
  }, [isPlaying, onPlaybackChange]);

  const togglePlayback = () => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    if (audio.paused) {
      audio.play().catch(() => {
        setIsPlaying(false);
      });
      return;
    }

    audio.pause();
  };

  const handleSeek = (time: number) => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    audio.currentTime = time;
    setCurrentTime(time);
  };

  const retry = useCallback(() => {
    setError(null);
    setReloadToken((token) => token + 1);
  }, []);

  return { currentTime, duration, error, isPlaying, retry, togglePlayback, handleSeek };
}
