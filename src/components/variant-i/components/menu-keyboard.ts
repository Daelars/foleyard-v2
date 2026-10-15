"use client";

import type { RefObject } from "react";
import { useCallback, useEffect, useRef } from "react";

/** Quiet period before a typeahead buffer starts a new search. */
export const TYPEAHEAD_RESET_MS = 500;

/**
 * Sticky typeahead buffer. Letters accumulate for `resetMs` so that "am" can
 * still find "Ambient" after "a" already matched something else; the buffer
 * then starts over. `cancel()` drops it (a closed widget must not keep state
 * for the next open).
 */
export function createTypeahead(resetMs = TYPEAHEAD_RESET_MS) {
  let text = "";
  let timer: ReturnType<typeof setTimeout> | null = null;

  const cancel = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    text = "";
  };

  return {
    push(key: string) {
      text += key.toLowerCase();
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        text = "";
        timer = null;
      }, resetMs);
      return text;
    },
    cancel,
    get text() {
      return text;
    },
  };
}

/**
 * Index of the first entry matching `buffer`, searched forward from `from`
 * and wrapping once, so the current entry is the last candidate rather than
 * the first. `-1` when nothing matches.
 */
export function typeaheadMatch(
  labels: readonly string[],
  buffer: string,
  from: number,
): number {
  if (labels.length === 0 || buffer.length === 0) return -1;
  for (let offset = 1; offset <= labels.length; offset += 1) {
    const index = (from + offset) % labels.length;
    const label = (labels[index] ?? "").trim().toLowerCase();
    if (label.startsWith(buffer)) return index;
  }
  return -1;
}

/**
 * The items a roving menu may move focus to: enabled `menuitem` elements in
 * DOM order. Disabled items stay visible but are never focused.
 */
export function enabledMenuItems(menu: HTMLElement | null): HTMLElement[] {
  if (!menu) return [];
  return Array.from(
    menu.querySelectorAll<HTMLElement>('[role="menuitem"]'),
  ).filter(
    (item) =>
      !item.hasAttribute("disabled") &&
      item.getAttribute("aria-disabled") !== "true",
  );
}

export type MenuKeyboardOptions = {
  /** Element carrying `role="menu"`; the hook owns the ref as well. */
  menuRef: RefObject<HTMLElement | null>;
  /** Called when Escape or Tab dismisses the menu. */
  onClose: () => void;
  /** Element that takes focus back on Escape — the trigger that opened the menu. */
  returnFocusRef?: RefObject<HTMLElement | null>;
};

/**
 * The keyboard contract a `role="menu"` popup owes the roles it advertises.
 * Attach the returned callback ref to the popup element; the behaviour lives
 * exactly as long as that element is mounted, so callers keep mounting the
 * popup only while it is open.
 *
 * - opening moves focus to the first enabled item (a roving focus, not tab
 *   stops: the trigger stays the single tab stop that opens the menu)
 * - ArrowDown/ArrowUp move with wrapping, Home/End jump to the ends
 * - typing jumps to the next item whose text starts with the typed letters
 * - disabled items are skipped by every movement
 * - Escape closes and returns focus to the trigger; Tab closes and lets the
 *   browser carry on from the trigger
 *
 * The returned ref is stable: re-renders (which the row menus do when a tag
 * is toggled) never re-focus the first item under the user's cursor.
 */
export function useMenuKeyboard({
  menuRef,
  onClose,
  returnFocusRef,
}: MenuKeyboardOptions): (node: HTMLElement | null) => void {
  const latest = useRef({ onClose, returnFocusRef });
  useEffect(() => {
    latest.current = { onClose, returnFocusRef };
  });

  return useCallback(
    (node: HTMLElement | null) => {
      menuRef.current = node;
      if (!node) return;

      const typeahead = createTypeahead();
      const focusItem = (item: HTMLElement | undefined) =>
        item?.focus({ preventScroll: true });

      const items = () => enabledMenuItems(node);
      const focusedIndex = (list: HTMLElement[]) =>
        list.indexOf(document.activeElement as HTMLElement);

      const onKeyDown = (event: KeyboardEvent) => {
        const list = items();
        if (list.length === 0) return;
        const current = focusedIndex(list);

        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          const step = event.key === "ArrowDown" ? 1 : -1;
          const next =
            current === -1
              ? step > 0
                ? 0
                : list.length - 1
              : (current + step + list.length) % list.length;
          focusItem(list[next]);
          return;
        }

        if (event.key === "Home" || event.key === "End") {
          event.preventDefault();
          focusItem(event.key === "Home" ? list[0] : list[list.length - 1]);
          return;
        }

        if (event.key === "Tab") {
          // Closing without preventDefault lets Tab continue from the trigger
          // instead of stalling on a menu item that is about to unmount.
          typeahead.cancel();
          latest.current.onClose();
          return;
        }

        if (
          event.key.length !== 1 ||
          event.ctrlKey ||
          event.metaKey ||
          event.altKey
        ) {
          return;
        }

        const match = typeaheadMatch(
          list.map((item) => item.textContent ?? ""),
          typeahead.push(event.key),
          current,
        );
        if (match !== -1) focusItem(list[match]);
      };

      // Escape is caught on the document so a menu whose items are all
      // disabled (a lone "no tags yet" row) can still be dismissed. Marking
      // the key consumed keeps an enclosing modal surface from also closing
      // on the same press.
      const onEscape = (event: KeyboardEvent) => {
        if (event.key !== "Escape") return;
        event.preventDefault();
        typeahead.cancel();
        latest.current.onClose();
        latest.current.returnFocusRef?.current?.focus({ preventScroll: true });
      };

      node.addEventListener("keydown", onKeyDown);
      document.addEventListener("keydown", onEscape, true);
      focusItem(items()[0]);

      return () => {
        typeahead.cancel();
        node.removeEventListener("keydown", onKeyDown);
        document.removeEventListener("keydown", onEscape, true);
        if (menuRef.current === node) menuRef.current = null;
      };
    },
    [menuRef],
  );
}
