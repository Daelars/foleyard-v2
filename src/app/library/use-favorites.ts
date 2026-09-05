"use client";

import { useCallback, useState } from "react";

/**
 * Consume a server-reported favourites total: numbers win, anything else
 * keeps the current badge count.
 */
export function consumeFavoritesTotal(total: unknown): number | null {
  return typeof total === "number" ? total : null;
}

/**
 * Favorites slice: the favourites badge count owns its remote state here.
 * File mutations report their new total through `noteFavoritesTotal` instead
 * of refetching, and the count loader refreshes only this slice. This hook
 * never writes another hook's state.
 */
export function useFavorites() {
  const [favoritesCount, setFavoritesCount] = useState(0);

  const loadFavoritesCount = useCallback(async () => {
    try {
      const res = await fetch("/api/files?favorites=true&limit=1");
      if (!res.ok) {
        return;
      }
      const data = (await res.json()) as { favoritesTotal?: number };
      const total = consumeFavoritesTotal(data.favoritesTotal);
      if (total !== null) {
        setFavoritesCount(total);
      }
    } catch {
      // Badge keeps its last count.
    }
  }, []);

  const noteFavoritesTotal = useCallback((total: unknown) => {
    const next = consumeFavoritesTotal(total);
    if (next !== null) {
      setFavoritesCount(next);
    }
  }, []);

  return {
    favoritesCount,
    loadFavoritesCount,
    noteFavoritesTotal,
  };
}
