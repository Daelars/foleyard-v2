"use client";

// Shared right-click popup menu for app-v3 rows. One state per table: the
// table opens it with (file, cursor position), the popup positions a
// variant I Menu at the cursor, clamps to the viewport, closes on outside
// click / Escape / scroll / resize, and restores focus to the trigger row.
import { useCallback, useEffect, useRef, useState } from "react";

import { Menu } from "@/components/variant-i";

export type RowMenuState<T> = { item: T; x: number; y: number } | null;

export function useRowContextMenu<T>() {
  const [state, setState] = useState<RowMenuState<T>>(null);
  const open = useCallback((item: T, x: number, y: number) => {
    setState({ item, x, y });
  }, []);
  const close = useCallback(() => setState(null), []);
  return { menu: state, openMenu: open, closeMenu: close };
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

  useEffect(() => {
    if (!state) return;
    const node = menuRef.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    const right = state.x + rect.width > window.innerWidth - 8;
    const bottom = state.y + rect.height > window.innerHeight - 8;
    node.style.left = right ? `${Math.max(8, state.x - rect.width)}px` : `${state.x}px`;
    node.style.top = bottom ? `${Math.max(8, state.y - rect.height)}px` : `${state.y}px`;
  }, [state]);

  useEffect(() => {
    if (!state) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (menuRef.current && !menuRef.current.contains(target)) {
        onClose();
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        const trigger = document.querySelector<HTMLElement>("[data-file-id][tabindex='0']:focus");
        trigger?.focus();
      }
    };
    const onScroll = () => onClose();
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [state, onClose]);

  if (!state) return null;
  return (
    <div
      ref={menuRef}
      data-v3-context-menu
      role="menu"
      aria-label="Row actions"
      className="fixed z-[70] w-60 [animation:vi-menu-in_0.14s_ease-out] motion-reduce:[animation:none]"
      style={{ left: state.x, top: state.y }}
    >
      <Menu label={label}>{children}</Menu>
    </div>
  );
}