"use client";

import type { RefObject } from "react";
import { useCallback, useEffect, useRef } from "react";

/**
 * Controls a modal surface may move focus to, in DOM order. `focusableWithin`
 * then drops disabled controls, `tabindex="-1"` elements and anything hidden
 * (an element inside `display:none`, e.g. the inactive tabs of the Settings
 * dialog, is not a tab stop).
 */
export const FOCUSABLE_SELECTOR = [
  "a[href]",
  "area[href]",
  "button",
  "input",
  "select",
  "textarea",
  "iframe",
  "audio[controls]",
  "video[controls]",
  "[contenteditable]",
  "[tabindex]",
].join(",");

function isVisible(element: HTMLElement): boolean {
  if (typeof getComputedStyle !== "function") return true;
  // `display:none` on an ancestor hides the control too, so walk the chain
  // rather than only reading the control's own computed style.
  for (let node: HTMLElement | null = element; node; node = node.parentElement) {
    if (node.hidden) return false;
    const style = getComputedStyle(node);
    if (style.display === "none" || style.visibility === "hidden") return false;
  }
  return true;
}

/** The tabbable controls inside `root`, in DOM order. */
export function focusableWithin(root: HTMLElement | null): HTMLElement[] {
  if (!root) return [];
  return Array.from(
    root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
  ).filter((element) => {
    if (element.hasAttribute("disabled")) return false;
    if (element.getAttribute("aria-disabled") === "true") return false;
    const tabindex = element.getAttribute("tabindex");
    if (tabindex !== null && Number(tabindex) < 0) return false;
    if (element.getAttribute("type") === "hidden") return false;
    if (element.closest("[inert]")) return false;
    return isVisible(element);
  });
}

/**
 * Surfaces currently mounted with `useModalSurface`, oldest first. Escape and
 * the Tab trap belong to the topmost one only, so a confirmation opened from
 * inside a larger dialog does not also dismiss its parent.
 */
const openSurfaces: HTMLElement[] = [];

function topSurface(): HTMLElement | null {
  let top: HTMLElement | null = null;
  for (const surface of openSurfaces) {
    if (top === null) {
      top = surface;
    } else if (top.contains(surface)) {
      top = surface;
    } else if (surface.contains(top)) {
      // The current top is nested inside this one; keep the inner surface.
    } else if (
      top.compareDocumentPosition(surface) & Node.DOCUMENT_POSITION_FOLLOWING
    ) {
      top = surface;
    }
  }
  return top;
}

type BackgroundMark = {
  element: Element;
  inert: string | null;
  ariaHidden: string | null;
};

/**
 * Inert the workspace behind a modal surface. The surface is not portaled, so
 * "the background" is every sibling branch between the surface and the body:
 * at each ancestor the branch holding the surface stays live and its siblings
 * get `inert` + `aria-hidden="true"`. Walking outward like this works however
 * deep the surface sits (and for a dialog nested inside another dialog), and
 * the previous attribute values are restored on close so stacked surfaces
 * compose. The body's own children are left alone (global toast hosts and
 * other body-level chrome).
 */
function inertBackground(surface: HTMLElement): () => void {
  const marks: BackgroundMark[] = [];
  let branch: Element = surface;

  while (branch.parentElement && branch.parentElement !== document.body) {
    const parent: Element = branch.parentElement;
    for (const sibling of Array.from(parent.children)) {
      if (sibling === branch) continue;
      marks.push({
        element: sibling,
        inert: sibling.getAttribute("inert"),
        ariaHidden: sibling.getAttribute("aria-hidden"),
      });
      sibling.setAttribute("inert", "");
      sibling.setAttribute("aria-hidden", "true");
    }
    branch = parent;
  }

  return () => {
    for (const { element, inert, ariaHidden } of marks) {
      if (inert === null) element.removeAttribute("inert");
      else element.setAttribute("inert", inert);
      if (ariaHidden === null) element.removeAttribute("aria-hidden");
      else element.setAttribute("aria-hidden", ariaHidden);
    }
  };
}

/**
 * The control that last took a pointer press. Chromium focuses a button on
 * click, so `document.activeElement` already names the invoker there; Safari
 * does not focus buttons on click, so remember the pressed control and fall
 * back to it when the surface opens with focus still on the body.
 */
let lastPointerInvoker: HTMLElement | null = null;

if (typeof document !== "undefined") {
  document.addEventListener(
    "pointerdown",
    (event) => {
      const target = event.target;
      lastPointerInvoker =
        target instanceof Element
          ? target.closest<HTMLElement>(
              "button, a[href], input, select, textarea, [role='button'], [tabindex]",
            )
          : null;
    },
    true,
  );
}

function invokerAtOpen(node: HTMLElement): HTMLElement | null {
  const active = document.activeElement;
  if (
    active instanceof HTMLElement &&
    active !== document.body &&
    active !== document.documentElement &&
    !node.contains(active)
  ) {
    return active;
  }
  return lastPointerInvoker;
}

export type ModalSurfaceOptions = {
  /** Element carrying `role="dialog"`/`role="alertdialog"`; the hook owns the ref. */
  surfaceRef: RefObject<HTMLElement | null>;
  /** Called when the surface dismisses itself. */
  onClose: () => void;
  /**
   * Element that takes focus when the surface opens. Defaults to the element
   * that already holds focus if it is inside the surface (a `Field autoFocus`
   * keeps its intent), then the first focusable control, then the surface.
   */
  initialFocusRef?: RefObject<HTMLElement | null>;
  /**
   * Element that takes focus when the surface closes. Defaults to whatever
   * held focus when the surface opened — the control that invoked it.
   */
  returnFocusRef?: RefObject<HTMLElement | null>;
  /**
   * Whether Escape dismisses. A blocking surface that has to be answered (a
   * destructive confirmation, a flow mid-operation) passes `false` and offers
   * explicit actions instead.
   */
  closeOnEscape?: boolean;
};

/**
 * The focus contract a blocking surface owes the `role="dialog"` /
 * `aria-modal="true"` markup it renders. Attach the returned callback ref to
 * the surface element; the behaviour lives exactly as long as that element is
 * mounted, so callers keep mounting the surface only while it is open.
 *
 * - opening moves focus to an intentional target inside the surface
 * - Tab and Shift+Tab wrap inside it, skipping disabled and hidden controls
 * - the background branch is `inert` and `aria-hidden` for the surface's
 *   lifetime, and the previous values come back on close
 * - Escape dismisses (unless the surface says otherwise) once the topmost
 *   surface and any nested popup that already consumed the key are past
 * - closing restores focus to the invoking control, unless the caller has
 *   already moved focus somewhere intentional
 */
export function useModalSurface({
  surfaceRef,
  onClose,
  initialFocusRef,
  returnFocusRef,
  closeOnEscape = true,
}: ModalSurfaceOptions): (node: HTMLElement | null) => void {
  const latest = useRef({
    onClose,
    initialFocusRef,
    returnFocusRef,
    closeOnEscape,
  });
  useEffect(() => {
    latest.current = { onClose, initialFocusRef, returnFocusRef, closeOnEscape };
  });

  return useCallback(
    (node: HTMLElement | null) => {
      surfaceRef.current = node;
      if (!node) return;

      const opener = latest.current.returnFocusRef?.current ?? invokerAtOpen(node);

      openSurfaces.push(node);
      const restoreBackground = inertBackground(node);

      const target =
        latest.current.initialFocusRef?.current ??
        node.querySelector<HTMLElement>("[autofocus]") ??
        (document.activeElement instanceof HTMLElement &&
        node.contains(document.activeElement)
          ? document.activeElement
          : null) ??
        focusableWithin(node)[0] ??
        node;
      if (document.activeElement !== target) {
        target.focus({ preventScroll: true });
      }

      const onTab = (event: KeyboardEvent) => {
        if (event.key !== "Tab") return;
        if (topSurface() !== node) return;
        const controls = focusableWithin(node);
        if (controls.length === 0) {
          event.preventDefault();
          node.focus({ preventScroll: true });
          return;
        }
        const first = controls[0]!;
        const last = controls[controls.length - 1]!;
        const active = document.activeElement;
        if (
          !(active instanceof HTMLElement) ||
          active === node ||
          !node.contains(active)
        ) {
          event.preventDefault();
          (event.shiftKey ? last : first).focus({ preventScroll: true });
          return;
        }
        if (event.shiftKey && active === first) {
          event.preventDefault();
          last.focus({ preventScroll: true });
        } else if (!event.shiftKey && active === last) {
          event.preventDefault();
          first.focus({ preventScroll: true });
        }
      };

      // Escape is caught on the document so a surface whose focused control
      // has gone away can still be dismissed. A nested popup (menu, select)
      // marks the key consumed with `preventDefault`, and only the topmost
      // surface answers.
      const onEscape = (event: KeyboardEvent) => {
        if (event.key !== "Escape") return;
        if (event.defaultPrevented) return;
        if (!latest.current.closeOnEscape) return;
        if (topSurface() !== node) return;
        latest.current.onClose();
      };

      node.addEventListener("keydown", onTab);
      document.addEventListener("keydown", onEscape);

      return () => {
        node.removeEventListener("keydown", onTab);
        document.removeEventListener("keydown", onEscape);
        const index = openSurfaces.lastIndexOf(node);
        if (index !== -1) openSurfaces.splice(index, 1);
        restoreBackground();

        const active = document.activeElement;
        const focusWasInside =
          active instanceof HTMLElement && node.contains(active);
        const focusWasLost =
          active === null ||
          active === document.body ||
          active === document.documentElement;
        const restore =
          latest.current.returnFocusRef?.current ?? opener;
        // Never steal focus back from a control the caller moved it to on
        // purpose (a nav item that both closed the dialog and took focus).
        if (restore?.isConnected && (focusWasInside || focusWasLost)) {
          restore.focus({ preventScroll: true });
        }
        if (surfaceRef.current === node) surfaceRef.current = null;
      };
    },
    [surfaceRef],
  );
}
