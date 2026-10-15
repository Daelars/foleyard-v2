"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { AudioPlayerPreferences } from "./types";

const VOLUME_STORAGE_KEY = "foleyard-volume";
const LEGACY_VOLUME_STORAGE_KEYS = ["soundslop-volume"];
const DEFAULT_VOLUME = 0.72;

function clampVolume(value: number) {
  return Math.max(0, Math.min(1, value));
}

function readInitialVolume(): number {
  if (typeof window === "undefined") {
    return DEFAULT_VOLUME;
  }

  const savedVolume =
    window.localStorage.getItem(VOLUME_STORAGE_KEY) ??
    LEGACY_VOLUME_STORAGE_KEYS.map((key) =>
      window.localStorage.getItem(key),
    ).find((value) => value !== null);
  const parsedVolume = savedVolume ? Number(savedVolume) : DEFAULT_VOLUME;
  return Number.isFinite(parsedVolume) ? clampVolume(parsedVolume) : DEFAULT_VOLUME;
}

/**
 * Session volume and mute (#291). Mute and volume live for the whole session,
 * not per view. Muting never destroys the audible level: unmuting restores it,
 * so the unmute control can never remain silent at zero volume.
 */
export function useVolumePreferences(): AudioPlayerPreferences {
  const [volume, setVolume] = useState(readInitialVolume);
  const [isMuted, setIsMuted] = useState(() => readInitialVolume() === 0);
  const lastAudibleVolumeRef = useRef(
    volume > 0 ? volume : DEFAULT_VOLUME,
  );
  const volumeRef = useRef(volume);
  const isMutedRef = useRef(isMuted);

  useEffect(() => {
    volumeRef.current = volume;
    isMutedRef.current = isMuted;
    if (volume > 0) {
      lastAudibleVolumeRef.current = volume;
    }
  }, [volume, isMuted]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(VOLUME_STORAGE_KEY, String(volume));
    }
  }, [volume]);

  const handleVolumeChange = useCallback((value: number | readonly number[]) => {
    const nextVolume = clampVolume(Array.isArray(value) ? value[0] : value);

    setVolume(nextVolume);
    setIsMuted(nextVolume === 0);
  }, []);

  const toggleMute = useCallback(() => {
    if (isMutedRef.current || volumeRef.current === 0) {
      const restored =
        volumeRef.current > 0
          ? volumeRef.current
          : lastAudibleVolumeRef.current;
      setVolume(restored);
      setIsMuted(false);
      return;
    }

    setIsMuted(true);
  }, []);

  return { volume, isMuted, handleVolumeChange, toggleMute };
}
