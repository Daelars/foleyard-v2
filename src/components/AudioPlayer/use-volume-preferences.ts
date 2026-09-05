"use client";

import { useEffect, useState } from "react";

const VOLUME_STORAGE_KEY = "foleyard-volume";
const LEGACY_VOLUME_STORAGE_KEYS = ["soundslop-volume"];

function clampVolume(value: number) {
  return Math.max(0, Math.min(1, value));
}

export function useVolumePreferences() {
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
    return Number.isFinite(parsedVolume) ? clampVolume(parsedVolume) : 0.72;
  });
  const [isMuted, setIsMuted] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(VOLUME_STORAGE_KEY, String(volume));
    }
  }, [volume]);

  const handleVolumeChange = (value: number | readonly number[]) => {
    const nextVolume = clampVolume(Array.isArray(value) ? value[0] : value);

    setVolume(nextVolume);
    if (nextVolume > 0 && isMuted) {
      setIsMuted(false);
    }
    if (nextVolume === 0) {
      setIsMuted(true);
    }
  };

  return { volume, isMuted, setIsMuted, handleVolumeChange };
}
