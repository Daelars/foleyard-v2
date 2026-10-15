"use client";

// Shared right-click popup menu for app-v3 rows. One state per table: the
// table opens it with (item, target), the popup positions a variant I Menu at
// the pointer (or under the row when the keyboard opened it), clamps to the
// viewport, closes on outside click / Escape / scroll / resize, and hands
// focus to its first enabled item and back to the row on close.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import { Menu, useMenuKeyboard } from "@/components/variant-i";

/**
 * How a row menu was invoked. Rows fill this in from either the pointer event
 * or the keyboard gesture, so one popup owns both positioning and focus.
 */
export type RowMenuTarget = {
  /** Viewport position of a pointer-invoked menu. */
  x: number;
  y: number;
  /** The row the menu belongs to: anchors a keyboard menu, restores focus on close. */
  anchor: HTMLElement | null;
  /** True when the Menu key or Shift+F10 opened the menu rather than a pointer. */
  keyboard: boolean;
};

export type RowMenuState<T> = ({ item: T } & RowMenuTarget) | null;

export function useRowContextMenu<T>() {
  const [state, setState] = useState<RowMenuState<T>>(null);
  const open = useCallback((item: T, target: RowMenuTarget) => {
    setState({ item, ...target });
  }, []);
  const close = useCallback(() => setState(null), []);
  return { menu: state, openMenu: open, closeMenu: close };
}

/** The keyboard gestures that open a context menu on a focused row. */
export function isContextMenuKey(event: {
  key: string;
  shiftKey: boolean;
}): boolean {
  return event.key === "ContextMenu" || (event.shiftKey && event.key === "F10");
}

/**
 * Where a row's `contextmenu` event points. Browsers fire that event for
 * keyboard gestures too, with no pointer position; a real right-click never
 * lands on the exact viewport origin, so a zero position means the menu
 * belongs under the row rather than at the corner.
 */
export function rowMenuTargetFromEvent(
  event: React.MouseEvent<HTMLElement>,
): RowMenuTarget {
  return {
    x: event.clientX,
    y: event.clientY,
    anchor: event.currentTarget,
    keyboard: event.clientX === 0 && event.clientY === 0,
  };
}

export function RowContextMenu<T>({
  state,
  onClose,
  label,
  children,
}: {
  state: RowMenuState<T>;
  onClose: () => void;
  label: string;
  children: React.ReactNode;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<HTMLElement | null>(null);
  const menuKeyboardRef = useMenuKeyboard({
    menuRef,
    onClose,
    returnFocusRef: anchorRef,
  });

  useEffect(() => {
    anchorRef.current = state?.anchor ?? null;
  }, [state]);

  // Layout effect: a keyboard-opened menu must never paint at the origin
  // before it lands under its row.
  useLayoutEffect(() => {
    if (!state) return;
    const node = menuRef.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    const anchorRect = state.keyboard
      ? state.anchor?.getBoundingClientRect()
      : undefined;
    const x = anchorRect ? anchorRect.left : state.x;
    const y = anchorRect ? anchorRect.bottom + 4 : state.y;
    const right = x + rect.width > window.innerWidth - 8;
    const bottom = y + rect.height > window.innerHeight - 8;
    node.style.left = right ? `${Math.max(8, x - rect.width)}px` : `${Math.max(8, x)}px`;
    node.style.top = bottom ? `${Math.max(8, y - rect.height)}px` : `${y}px`;
  }, [state]);

  useEffect(() => {
    if (!state) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (menuRef.current && !menuRef.current.contains(target)) {
        onClose();
      }
    };
    const onScroll = () => onClose();
    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [state, onClose]);

  if (!state) return null;
  return (
    <div
      ref={menuKeyboardRef}
      data-v3-context-menu
      role="menu"
      aria-label="Row actions"
      className="fixed z-[70] w-60 [animation:vi-menu-in_0.14s_ease-out] motion-reduce:[animation:none]"
    >
      <Menu label={label}>{children}</Menu>
    </div>
  );
}
