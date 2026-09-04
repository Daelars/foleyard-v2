export type ShortcutAction =
  | "toggle-playback"
  | "focus-search"
  | "toggle-favorite"
  | "move-next"
  | "move-prev"
  | "open-settings";

export type ShortcutBindings = Record<ShortcutAction, string>;

export const DEFAULT_SHORTCUTS: ShortcutBindings = {
  "toggle-playback": "Space",
  "focus-search": "/",
  "toggle-favorite": "f",
  "move-next": "j",
  "move-prev": "k",
  "open-settings": ",",
};

export function mergeShortcutBindings(
  overrides: Partial<ShortcutBindings>,
): ShortcutBindings {
  const merged = { ...DEFAULT_SHORTCUTS };
  for (const [action, key] of Object.entries(overrides)) {
    if (key && typeof key === "string") {
      merged[action as ShortcutAction] = key;
    }
  }
  return merged;
}

export function findBindingConflicts(
  bindings: ShortcutBindings,
): Array<{ key: string; actions: ShortcutAction[] }> {
  const byKey = new Map<string, ShortcutAction[]>();
  for (const [action, key] of Object.entries(bindings)) {
    const normalized = key.toLowerCase();
    const list = byKey.get(normalized) ?? [];
    list.push(action as ShortcutAction);
    byKey.set(normalized, list);
  }

  return [...byKey.entries()]
    .filter(([, actions]) => actions.length > 1)
    .map(([key, actions]) => ({ key, actions }));
}

type GuardTarget = {
  tagName?: string;
  isContentEditable?: boolean;
  closest?: (selector: string) => unknown | null;
};

export function isTypingTarget(target: unknown): boolean {
  if (!target || typeof target !== "object") {
    return false;
  }

  const element = target as GuardTarget;
  const tag =
    typeof element.tagName === "string" ? element.tagName.toUpperCase() : "";

  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
    return true;
  }

  return element.isContentEditable === true;
}

const SPACE_SKIP_SELECTOR =
  'input, textarea, select, [contenteditable="true"], button, [role="slider"], [role="button"], a, audio, video';

const SPACE_SKIP_TAGS = new Set([
  "INPUT",
  "TEXTAREA",
  "SELECT",
  "BUTTON",
  "A",
  "AUDIO",
  "VIDEO",
]);

export function shouldSkipSpace(target: unknown): boolean {
  if (!target || typeof target !== "object") {
    return false;
  }

  const element = target as GuardTarget;
  if (typeof element.closest === "function") {
    try {
      return element.closest(SPACE_SKIP_SELECTOR) !== null;
    } catch {
      return false;
    }
  }

  const tag =
    typeof element.tagName === "string" ? element.tagName.toUpperCase() : "";
  return SPACE_SKIP_TAGS.has(tag) || element.isContentEditable === true;
}

export function matchShortcutKey(
  event: { code: string; key: string },
  key: string,
): boolean {
  if (key === "Space") {
    return event.code === "Space";
  }

  return event.key.toLowerCase() === key.toLowerCase();
}
