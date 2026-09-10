import type { PaletteSection } from "@/components/CommandPalette/command-palette";

/**
 * Built-in command descriptors (Application context, #242).
 *
 * One table owns every built-in palette action: id, section, dynamic title,
 * search keywords and availability gate. The palette builder renders from
 * this table and the palette/shortcut dispatch routes through the action map
 * below, so an action cannot exist in one place and be missing in the other.
 * Extension commands stay separate: they arrive as `v2tool:` entries from the
 * v2 catalog at call time.
 */

export type BuiltinCommandContext = {
  isPlaying: boolean;
  autoplay: boolean;
  hasCurrentFile: boolean;
  canStepQueue: boolean;
  isFavorite: boolean;
  shelfEnabled: boolean;
  autoTagEnabled: boolean;
};

export type BuiltinCommandDescriptor = {
  id: string;
  section: PaletteSection;
  hint: string;
  /** Shown label; play/pause, autoplay and save/unsave are context-dependent. */
  title: (context: BuiltinCommandContext) => string;
  /** Extra search terms beyond the title. */
  keywords?: (context: BuiltinCommandContext) => string[];
  /** Gate; absent means always available. */
  available?: (context: BuiltinCommandContext) => boolean;
};

export type BuiltinCommandAction =
  | "showLibrary"
  | "showFavorites"
  | "showShelf"
  | "showExtensions"
  | "showOrganize"
  | "showAutoTag"
  | "openSettings"
  | "togglePlayback"
  | "stepNext"
  | "stepPrev"
  | "toggleAutoplay"
  | "toggleFavoriteCurrent"
  | "addCurrentToShelf";

export type BuiltinCommandHandlers = Record<BuiltinCommandAction, () => void>;

export const BUILTIN_COMMANDS: readonly BuiltinCommandDescriptor[] = [
  { id: "view:library", section: "view", hint: "view", title: () => "Go to Library" },
  { id: "view:favorites", section: "view", hint: "view", title: () => "Go to Favorites" },
  {
    id: "view:shelf",
    section: "view",
    hint: "view",
    title: () => "Go to Shelf",
    available: (context) => context.shelfEnabled,
  },
  {
    id: "view:organize",
    section: "view",
    hint: "view",
    title: () => "Go to Organize",
    keywords: () => ["Organize", "Collections", "Tags"],
  },
  {
    id: "view:tools",
    section: "view",
    hint: "view",
    title: () => "Go to Extensions",
    keywords: () => ["Extensions", "Go to Tools", "Tools"],
  },
  {
    id: "view:auto-tag",
    section: "view",
    hint: "view",
    title: () => "Go to Auto tag",
    keywords: () => ["Auto tag", "Auto-tag", "Tagging"],
    available: (context) => context.autoTagEnabled,
  },
  {
    id: "view:settings",
    section: "view",
    hint: "view",
    title: () => "Open settings",
    keywords: () => ["Settings"],
  },
  {
    id: "transport:toggle-play",
    section: "transport",
    hint: "transport",
    title: (context) => (context.isPlaying ? "Pause" : "Play"),
    available: (context) => context.hasCurrentFile,
  },
  {
    id: "transport:next",
    section: "transport",
    hint: "transport",
    title: () => "Next in queue",
    available: (context) => context.canStepQueue,
  },
  {
    id: "transport:prev",
    section: "transport",
    hint: "transport",
    title: () => "Previous in queue",
    available: (context) => context.canStepQueue,
  },
  {
    id: "transport:autoplay",
    section: "transport",
    hint: "transport",
    title: (context) => `Autoplay ${context.autoplay ? "off" : "on"}`,
    keywords: () => ["Autoplay"],
  },
  {
    id: "file:toggle-favorite",
    section: "file",
    hint: "file",
    title: (context) => (context.isFavorite ? "Unsave current" : "Save current"),
    keywords: () => ["Save", "Unsave", "Favorite"],
    available: (context) => context.hasCurrentFile,
  },
  {
    id: "file:add-to-shelf",
    section: "file",
    hint: "file",
    title: () => "Add current file to shelf",
    keywords: () => ["Shelf"],
    available: (context) => context.hasCurrentFile && context.shelfEnabled,
  },
];

/**
 * Context used for non-live projections (runtime snapshot, docs): every gate
 * is satisfied so the canonical title for each action is visible.
 */
export const BUILTIN_COMMAND_PREVIEW_CONTEXT: BuiltinCommandContext = {
  isPlaying: false,
  autoplay: false,
  hasCurrentFile: true,
  canStepQueue: true,
  isFavorite: false,
  shelfEnabled: true,
  autoTagEnabled: true,
};

export const BUILTIN_COMMAND_ACTIONS: Record<string, BuiltinCommandAction> = {
  "view:library": "showLibrary",
  "view:favorites": "showFavorites",
  "view:shelf": "showShelf",
  "view:organize": "showOrganize",
  "view:tools": "showExtensions",
  "view:auto-tag": "showAutoTag",
  "view:settings": "openSettings",
  "transport:toggle-play": "togglePlayback",
  "transport:next": "stepNext",
  "transport:prev": "stepPrev",
  "transport:autoplay": "toggleAutoplay",
  "file:toggle-favorite": "toggleFavoriteCurrent",
  "file:add-to-shelf": "addCurrentToShelf",
};

export function isBuiltinCommandId(id: string): boolean {
  return Object.hasOwn(BUILTIN_COMMAND_ACTIONS, id);
}

/** Invoke the handler for a built-in command id; false when the id is not built-in. */
export function dispatchBuiltinCommand(
  id: string,
  handlers: BuiltinCommandHandlers,
): boolean {
  const action = BUILTIN_COMMAND_ACTIONS[id];
  if (!action) return false;
  handlers[action]();
  return true;
}
