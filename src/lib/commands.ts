/**
 * App-level command descriptor table unifying built-in palette commands
 * with extension commands.
 * Feature status: shipped. Contract: internal.
 * Preserves existing palette IDs and shortcut preferences; no ID renames.
 */

export type AppCommandDescriptor = {
  id: string;
  title: string;
  kind: "builtin" | "tool";
  extensionId?: string;
  commandId?: string;
  defaultShortcut?: string;
  destructive?: boolean;
  docsId: string;
};

/** Built-in palette entries mirror command-palette.ts sections. */
export const APP_COMMAND_DESCRIPTORS: AppCommandDescriptor[] = [
  { id: "view:toggle-playback", title: "Toggle playback", kind: "builtin", defaultShortcut: "Space", docsId: "commands" },
  { id: "view:focus-search", title: "Focus search", kind: "builtin", defaultShortcut: "/", docsId: "commands" },
  { id: "view:toggle-favorite", title: "Toggle favorite", kind: "builtin", defaultShortcut: "f", docsId: "commands" },
  { id: "view:next", title: "Next sound", kind: "builtin", defaultShortcut: "j", docsId: "commands" },
  { id: "view:prev", title: "Previous sound", kind: "builtin", defaultShortcut: "k", docsId: "commands" },
  { id: "view:open-settings", title: "Open settings", kind: "builtin", defaultShortcut: ",", docsId: "commands" },
];

export function describeAppCommand(id: string): AppCommandDescriptor | undefined {
  return APP_COMMAND_DESCRIPTORS.find((c) => c.id === id);
}

export function toolPaletteId(extensionId: string, commandId: string): string {
  return `tool:${extensionId}:${commandId}`;
}
