"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import type { AudioPlayerFileRecord } from "./types";

const VOLUME_STORAGE_KEY = "foleyard-volume";
const LEGACY_VOLUME_STORAGE_KEYS = ["soundslop-volume"];

export function useAudioPlayback(
  selectedFile: AudioPlayerFileRecord,
  onPlaybackChange?: (isPlaying: boolean) => void,
) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const volumeRef = useRef(0.72);
  const isMutedRef = useRef(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [waveformData] = useState<number[]>([]);
  const [volume, setVolume] = useState(() => {
    if (typeof window === "undefined") {
      return 0.72;
    }

    const savedVolume =
      window.localStorage.getItem(VOLUME_STORAGE_KEY) ??
      LEGACY_VOLUME_STORAGE_KEYS.map((key) => window.localStorage.getItem(key)).find(
        (value) => value !== null,
      );
    const parsedVolume = savedVolume ? Number(savedVolume) : 0.72;
    return Number.isFinite(parsedVolume) ? parsedVolume : 0.72;
  });
  const [isMuted, setIsMuted] = useState(false);

  useEffect(() => {
    volumeRef.current = volume;
    isMutedRef.current = isMuted;
  }, [isMuted, volume]);

  useEffect(() => {
    const audio = new Audio(`/api/audio?id=${encodeURIComponent(selectedFile.id)}`);
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
    };

    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("ended", handleEnded);

    audio.play().catch(() => {
      setIsPlaying(false);
    });

    return () => {
      audio.pause();
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("ended", handleEnded);
      audio.src = "";

      if (audioRef.current === audio) {
        audioRef.current = null;
      }
    };
  }, [selectedFile.id]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume;
    }
  }, [isMuted, volume]);

  useEffect(() => {
    onPlaybackChange?.(isPlaying);
  }, [isPlaying, onPlaybackChange]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(VOLUME_STORAGE_KEY, String(volume));
    }
  }, [volume]);

  const title = useMemo(
    () => selectedFile.filename.replace(/\.[^.]+$/, ""),
    [selectedFile.filename],
  );

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

  const handleVolumeChange = (value: number | readonly number[]) => {
    const nextVolume = Array.isArray(value) ? value[0] : value;

    setVolume(nextVolume);
    if (nextVolume > 0 && isMuted) {
      setIsMuted(false);
    }
    if (nextVolume === 0) {
      setIsMuted(true);
    }
  };

  return {
    currentTime,
    duration,
    effectiveDuration: duration || selectedFile.duration || 0,
    handleSeek,
    handleVolumeChange,
    isMuted,
    isPlaying,
    setIsMuted,
    title,
    togglePlayback,
    volume,
    waveformData,
  };
}
