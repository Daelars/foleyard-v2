"use client";

import type { HTMLAttributes, ReactNode } from "react";

/**
 * Variant I library host. Mount once at the route root:
 *
 *   <VariantIProvider className="h-full">…</VariantIProvider>
 *
 * The provider renders the `[data-variant-i]` scope marker (which activates
 * the tokens in styles.css), the shared keyframe stylesheet, and the faint
 * red ambient blooms the specimen shows at its frame edges. The
 * `data-variant-i` marker and the keyframes are global once mounted, so
 * fixed-position library portals rendered anywhere under the route keep the
 * same tokens and animation names.
 *
 * Import the library stylesheet once from the route layout:
 *   import "src/components/variant-i/styles.css";
 */
const KEYFRAME_CSS = `
@keyframes vi-menu-in { from { opacity: 0; transform: translateY(-4px) scale(0.99); } to { opacity: 1; transform: translateY(0) scale(1); } }
@keyframes vi-shimmer { from { transform: translateX(-100%); } to { transform: translateX(220%); } }
@keyframes vi-pop { 0% { transform: scale(0.5); } 60% { transform: scale(1.12); } 100% { transform: scale(1); } }
@keyframes vi-draw { from { stroke-dashoffset: 12; } to { stroke-dashoffset: 0; } }
@keyframes vi-fade { from { opacity: 0; } to { opacity: 1; } }
`;

export function VariantIProvider({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
}) {
  return (
    <div data-variant-i className={className} {...props}>
      <style>{KEYFRAME_CSS}</style>
      {/* Faint red ambience at the frame edges, as in the mockup. */}
      <span
        aria-hidden
        className="pointer-events-none absolute -left-24 top-1/3 size-72 rounded-full bg-[color-mix(in_oklab,var(--accent-fill)_7%,transparent)] blur-3xl"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute -right-24 top-0 size-80 rounded-full bg-[color-mix(in_oklab,var(--accent-fill)_8%,transparent)] blur-3xl"
      />
      {children}
    </div>
  );
}

/** Mount the library keyframes standalone (e.g. inside an existing root). */
export function VariantIKeyframes() {
  return <style>{KEYFRAME_CSS}</style>;
}