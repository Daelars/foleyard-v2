import { BUILTIN_COMMANDS } from "@/lib/commands";

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
  autoTagEnabled: boolean;
  /** v2 extension entries (R6): `v2tool:` IDs resolved by the v2 bridge. */
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

  // Built-in actions render from the single descriptor table (#242).
  for (const command of BUILTIN_COMMANDS) {
    const label = command.title(input);
    push(
      { id: command.id, label, section: command.section, hint: command.hint },
      [label, ...(command.keywords?.(input) ?? [])],
      command.available ? command.available(input) : true,
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
