export type PaletteSection = "view" | "transport" | "file" | "tool" | "sound";

export interface PaletteToolCommand {
  extensionId: string;
  extensionName: string;
  commandId: string;
  title: string;
}

export interface PaletteSound {
  id: string;
  filename: string;
  format: string | null;
  duration: number | null;
  tags: string[];
}

export interface PaletteEntry {
  id: string;
  label: string;
  section: PaletteSection;
  hint: string;
}

export interface PaletteBuildInput {
  query: string;
  isPlaying: boolean;
  autoplay: boolean;
  hasCurrentFile: boolean;
  canStepQueue: boolean;
  isFavorite: boolean;
  shelfEnabled: boolean;
  toolCommands: PaletteToolCommand[];
  /** v2 extension entries (R6): same shape, `v2tool:` IDs, v1 IDs untouched. */
  v2ToolCommands?: PaletteToolCommand[];
  sounds: PaletteSound[];
  soundLimit?: number;
}

export const PALETTE_SOUND_LIMIT = 6;

export function formatPaletteDuration(totalSeconds: number | null): string | null {
  if (
    totalSeconds === null ||
    !Number.isFinite(totalSeconds) ||
    totalSeconds < 0
  ) {
    return null;
  }

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function soundHint(sound: PaletteSound): string {
  const parts: string[] = [];
  if (sound.format) {
    parts.push(sound.format);
  }

  const duration = formatPaletteDuration(sound.duration);
  if (duration) {
    parts.push(duration);
  }

  return parts.join(" · ") || "sound";
}

export function buildPaletteEntries(input: PaletteBuildInput): PaletteEntry[] {
  const query = input.query.trim().toLowerCase();
  const match = (text: string) => !query || text.toLowerCase().includes(query);
  const soundLimit = input.soundLimit ?? PALETTE_SOUND_LIMIT;

  const entries: PaletteEntry[] = [];
  const push = (
    entry: PaletteEntry,
    haystacks: string[],
    available: boolean,
  ) => {
    if (!available) {
      return;
    }

    if (!haystacks.some(match)) {
      return;
    }

    entries.push(entry);
  };

  push(
    { id: "view:library", label: "Go to Library", section: "view", hint: "view" },
    ["Go to Library"],
    true,
  );
  push(
    {
      id: "view:favorites",
      label: "Go to Favorites",
      section: "view",
      hint: "view",
    },
    ["Go to Favorites"],
    true,
  );
  push(
    { id: "view:shelf", label: "Go to Shelf", section: "view", hint: "view" },
    ["Go to Shelf"],
    true,
  );
  push(
    { id: "view:organize", label: "Go to Organize", section: "view", hint: "view" },
    ["Go to Organize", "Organize", "Collections", "Tags"],
    true,
  );
  push(
    { id: "view:tools", label: "Go to Extensions", section: "view", hint: "view" },
    ["Go to Extensions", "Extensions", "Go to Tools", "Tools"],
    true,
  );
  push(
    {
      id: "view:settings",
      label: "Open settings",
      section: "view",
      hint: "view",
    },
    ["Open settings", "Settings"],
    true,
  );

  const togglePlayLabel = input.isPlaying ? "Pause" : "Play";
  push(
    {
      id: "transport:toggle-play",
      label: togglePlayLabel,
      section: "transport",
      hint: "transport",
    },
    [togglePlayLabel],
    input.hasCurrentFile,
  );
  push(
    {
      id: "transport:next",
      label: "Next in queue",
      section: "transport",
      hint: "transport",
    },
    ["Next in queue"],
    input.canStepQueue,
  );
  push(
    {
      id: "transport:prev",
      label: "Previous in queue",
      section: "transport",
      hint: "transport",
    },
    ["Previous in queue"],
    input.canStepQueue,
  );
  const autoplayLabel = `Autoplay ${input.autoplay ? "off" : "on"}`;
  push(
    {
      id: "transport:autoplay",
      label: autoplayLabel,
      section: "transport",
      hint: "transport",
    },
    [autoplayLabel, "Autoplay"],
    true,
  );

  const favoriteLabel = input.isFavorite ? "Unsave current" : "Save current";
  push(
    {
      id: "file:toggle-favorite",
      label: favoriteLabel,
      section: "file",
      hint: "file",
    },
    [favoriteLabel, "Save", "Unsave", "Favorite"],
    input.hasCurrentFile,
  );
  push(
    {
      id: "file:add-to-shelf",
      label: "Add current file to shelf",
      section: "file",
      hint: "file",
    },
    ["Add current file to shelf", "Shelf"],
    input.hasCurrentFile && input.shelfEnabled,
  );

  for (const command of input.toolCommands) {
    push(
      {
        id: `tool:${command.extensionId}:${command.commandId}`,
        label: command.title,
        section: "tool",
        hint: "tool",
      },
      [command.title, command.extensionName, command.commandId],
      true,
    );
  }

  for (const command of input.v2ToolCommands ?? []) {
    push(
      {
        id: `v2tool:${command.extensionId}:${command.commandId}`,
        label: command.title,
        section: "tool",
        hint: "tool",
      },
      [command.title, command.extensionName, command.commandId],
      true,
    );
  }

  if (soundLimit > 0) {
    let added = 0;
    for (const sound of input.sounds) {
      if (added >= soundLimit) {
        break;
      }

      if (![sound.filename, ...sound.tags].some(match)) {
        continue;
      }

      entries.push({
        id: `sound:${sound.id}`,
        label: sound.filename,
        section: "sound",
        hint: soundHint(sound),
      });
      added += 1;
    }
  }

  return entries;
}
