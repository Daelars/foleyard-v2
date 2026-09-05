"use client";

import { useEffect, useRef, useState } from "react";

export function useAudioElement(fileId: string, volume: number, isMuted: boolean, onPlaybackChange?: (isPlaying: boolean) => void, onEnded?: () => void) {
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
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(audio.duration || 0);
      onEndedRef.current?.();
    };

    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("ended", handleEnded);

    audio.play().catch(() => {
      if (active) setIsPlaying(false);
    });

    return () => {
      active = false;
      audio.pause();
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("ended", handleEnded);
      audio.removeAttribute("src");
      audio.load();

      if (audioRef.current === audio) {
        audioRef.current = null;
      }
    };
  }, [fileId]);

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

  return { currentTime, duration, isPlaying, togglePlayback, handleSeek };
}
