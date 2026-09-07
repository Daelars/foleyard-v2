"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  buildPaletteEntries,
  type PaletteEntry,
  type PaletteToolCommand,
} from "@/components/CommandPalette/command-palette";
import {
  DEFAULT_SHORTCUTS,
  isTypingTarget,
  loadShortcutBindings,
  matchShortcutKey,
  persistShortcutBindings,
  shouldSkipSpace,
  type ShortcutAction,
  type ShortcutBindings,
} from "@/components/Shortcuts/shortcuts";
import type { ExtensionGridItem } from "@/lib/extensions/types";
import { toolPaletteId } from "@/lib/commands";
import type { FileRecord } from "./types";
// App command descriptors (src/lib/commands.ts) map current palette IDs and
// shortcut actions; tool entries below consume the same `tool:{ext}:{cmd}`
// shape via toolPaletteId so palette, shortcuts and registry agree.

/** Split a palette entry id into its kind and payload. */
export function parsePaletteEntryId(id: string): {
  kind: string;
  rest: string;
} {
  const separator = id.indexOf(":");
  if (separator === -1) {
    return { kind: id, rest: "" };
  }
  return { kind: id.slice(0, separator), rest: id.slice(separator + 1) };
}

/** Clamp the active index into the entries range. */
export function clampPaletteIndex(index: number, length: number): number {
  if (length === 0) {
    return 0;
  }
  return Math.min(index, length - 1);
}

/** Step the palette cursor with wraparound. */
export function stepPaletteIndex(
  index: number,
  direction: 1 | -1,
  length: number,
): number {
  const size = Math.max(1, length);
  return (index + direction + size) % size;
}

export interface PaletteInput {
  extensions: ExtensionGridItem[];
  orderedFiles: FileRecord[];
  isPlaying: boolean;
  autoplay: boolean;
  selectedFile: FileRecord | null;
  canStepQueue: boolean;
  shelfEnabled: boolean;
  showLibrary: () => void;
  showFavorites: () => void;
  showShelf: () => void;
  showExtensions: () => void;
  showOrganize: () => void;
  openSettings: () => void;
  togglePlayback: () => void;
  stepNext: () => void;
  stepPrev: () => void;
  toggleAutoplay: () => void;
  toggleFavoriteCurrent: () => void;
  addCurrentToShelf: () => void;
  runCommand: (extensionId: string, commandId: string) => void;
  /** v2 palette entries (R6): resolved by the v2 bridge, dispatched via runV2Command. */
  v2ToolCommands?: PaletteToolCommand[];
  runV2Command?: (extensionId: string, commandId: string) => void;
  playSound: (fileId: string) => void;
  moveNext: () => void;
  movePrev: () => void;
}

/**
 * Command palette and keyboard shortcuts: palette state, entry building,
 * selection dispatch, and every global key handler. View and transport
 * actions arrive through explicit callbacks; this hook owns only palette,
 * shortcut-binding, and input-focus state.
 */
export function usePalette(input: PaletteInput) {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteQuery, setPaletteQuery] = useState("");
  const [paletteIndex, setPaletteIndex] = useState(0);
  const paletteInputRef = useRef<HTMLInputElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const [shortcutBindings, setShortcutBindings] =
    useState<ShortcutBindings>(loadShortcutBindings);

  const inputRef = useRef(input);
  useEffect(() => {
    inputRef.current = input;
  });

  const openPalette = useCallback(() => {
    setPaletteQuery("");
    setPaletteIndex(0);
    setPaletteOpen(true);
  }, []);

  const closePalette = useCallback(() => {
    setPaletteOpen(false);
  }, []);

  const handlePaletteQueryChange = useCallback((query: string) => {
    setPaletteQuery(query);
    setPaletteIndex(0);
  }, []);

  const focusSearch = useCallback(() => {
    searchInputRef.current?.focus();
  }, []);

  const handleRebindShortcut = useCallback(
    (action: ShortcutAction, key: string) => {
      setShortcutBindings((prev) => {
        const next = { ...prev, [action]: key };
        persistShortcutBindings(next);
        return next;
      });
    },
    [],
  );

  const handleResetShortcuts = useCallback(() => {
    setShortcutBindings({ ...DEFAULT_SHORTCUTS });
    persistShortcutBindings({ ...DEFAULT_SHORTCUTS });
  }, []);

  const paletteToolCommands = useMemo(
    () =>
      input.extensions.flatMap((extension) =>
        extension.enabled
          ? ((extension.commands ?? []).map((command) => ({
              extensionId: extension.id,
              extensionName: extension.name,
              commandId: command.id,
              title: command.title,
              paletteId: toolPaletteId(extension.id, command.id),
            })) as Array<{
              extensionId: string;
              extensionName: string;
              commandId: string;
              title: string;
              paletteId: string;
            }>)
          : [],
      ),
    [input.extensions],
  );

  const paletteSounds = useMemo(
    () =>
      input.orderedFiles.map((file) => ({
        id: file.id,
        filename: file.filename,
        format: file.format,
        duration: file.duration,
        tags: file.tags.map((tag) => tag.name),
      })),
    [input.orderedFiles],
  );

  const paletteEntries = useMemo(
    () =>
      buildPaletteEntries({
        query: paletteQuery,
        isPlaying: input.isPlaying,
        autoplay: input.autoplay,
        hasCurrentFile: input.selectedFile !== null,
        canStepQueue: input.canStepQueue,
        isFavorite: input.selectedFile?.isFavorite ?? false,
        shelfEnabled: input.shelfEnabled,
        toolCommands: paletteToolCommands,
        v2ToolCommands: input.v2ToolCommands ?? [],
        sounds: paletteSounds,
      }),
    [
      paletteQuery,
      input.isPlaying,
      input.autoplay,
      input.selectedFile,
      input.canStepQueue,
      input.shelfEnabled,
      paletteToolCommands,
      input.v2ToolCommands,
      paletteSounds,
    ],
  );

  const activePaletteIndex = clampPaletteIndex(paletteIndex, paletteEntries.length);

  const handlePaletteSelect = useCallback(
    (entry: PaletteEntry) => {
      const actions = inputRef.current;
      const { kind, rest } = parsePaletteEntryId(entry.id);

      switch (kind) {
        case "view": {
          if (rest === "library") actions.showLibrary();
          else if (rest === "favorites") actions.showFavorites();
          else if (rest === "shelf") actions.showShelf();
          else if (rest === "tools") actions.showExtensions();
          else if (rest === "organize") actions.showOrganize();
          else if (rest === "settings") actions.openSettings();
          break;
        }
        case "transport": {
          if (rest === "toggle-play") actions.togglePlayback();
          else if (rest === "next") actions.stepNext();
          else if (rest === "prev") actions.stepPrev();
          else if (rest === "autoplay") actions.toggleAutoplay();
          break;
        }
        case "file": {
          if (rest === "toggle-favorite") {
            actions.toggleFavoriteCurrent();
          } else if (rest === "add-to-shelf") {
            actions.addCurrentToShelf();
          }
          break;
        }
        case "tool": {
          const split = rest.indexOf(":");
          if (split !== -1) {
            actions.runCommand(rest.slice(0, split), rest.slice(split + 1));
          }
          break;
        }
        case "v2tool": {
          const split = rest.indexOf(":");
          if (split !== -1) {
            actions.runV2Command?.(rest.slice(0, split), rest.slice(split + 1));
          }
          break;
        }
        case "sound": {
          actions.playSound(rest);
          break;
        }
      }

      setPaletteOpen(false);
    },
    [],
  );

  useEffect(() => {
    if (paletteOpen) {
      paletteInputRef.current?.focus();
    }
  }, [paletteOpen]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        if (paletteOpen) {
          setPaletteOpen(false);
        } else {
          setPaletteQuery("");
          setPaletteIndex(0);
          setPaletteOpen(true);
        }
        return;
      }

      if (!paletteOpen) {
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        setPaletteOpen(false);
        return;
      }

      if (event.key === "ArrowDown") {
        event.preventDefault();
        event.stopPropagation();
        setPaletteIndex((index) =>
          stepPaletteIndex(index, 1, paletteEntries.length),
        );
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        event.stopPropagation();
        setPaletteIndex((index) =>
          stepPaletteIndex(index, -1, paletteEntries.length),
        );
        return;
      }

      if (event.key === "Enter") {
        const target = event.target as HTMLElement | null;
        const inPaletteInput = target === paletteInputRef.current;
        const entry = paletteEntries[activePaletteIndex];
        if (entry && (inPaletteInput || target === document.body)) {
          event.preventDefault();
          event.stopPropagation();
          handlePaletteSelect(entry);
        }
      }
    };

    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [paletteOpen, paletteEntries, activePaletteIndex, handlePaletteSelect]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      if (paletteOpen) {
        return;
      }

      const actions = inputRef.current;

      if (matchShortcutKey(event, shortcutBindings["toggle-playback"])) {
        if (shouldSkipSpace(event.target)) {
          return;
        }

        event.preventDefault();
        actions.togglePlayback();
        return;
      }

      if (isTypingTarget(event.target)) {
        return;
      }

      if (matchShortcutKey(event, shortcutBindings["focus-search"])) {
        event.preventDefault();
        searchInputRef.current?.focus();
      } else if (matchShortcutKey(event, shortcutBindings["toggle-favorite"])) {
        actions.toggleFavoriteCurrent();
      } else if (matchShortcutKey(event, shortcutBindings["move-next"])) {
        event.preventDefault();
        actions.moveNext();
      } else if (matchShortcutKey(event, shortcutBindings["move-prev"])) {
        event.preventDefault();
        actions.movePrev();
      } else if (matchShortcutKey(event, shortcutBindings["open-settings"])) {
        event.preventDefault();
        actions.openSettings();
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [paletteOpen, shortcutBindings]);

  return {
    paletteOpen,
    paletteQuery,
    paletteIndex,
    setPaletteIndex,
    paletteInputRef,
    searchInputRef,
    shortcutBindings,
    paletteEntries,
    activePaletteIndex,
    openPalette,
    closePalette,
    handlePaletteQueryChange,
    handlePaletteSelect,
    handleRebindShortcut,
    handleResetShortcuts,
    focusSearch,
  };
}
