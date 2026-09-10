"use client";

import { useCallback, useRef, useState } from "react";
import type { ReactNode } from "react";

/**
 * Tools surface for the Extensions view: a mouse-tracked radial backdrop
 * hosting the v2 tool cards. v1 cards and the retired catalog are gone;
 * `V3ToolsCards` owns its own loading and job state.
 */
export function V3ExtensionGrid({ children }: { children: ReactNode }) {
  const [mouse, setMouse] = useState({ x: 50, y: 50 });
  const rafRef = useRef<number | null>(null);
  const mouseRef = useRef({ x: 50, y: 50 });

  const handleGridMouseMove = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      const rect = event.currentTarget.getBoundingClientRect();
      mouseRef.current = {
        x: ((event.clientX - rect.left) / rect.width) * 100,
        y: ((event.clientY - rect.top) / rect.height) * 100,
      };
      if (rafRef.current === null) {
        rafRef.current = requestAnimationFrame(() => {
          rafRef.current = null;
          setMouse({ ...mouseRef.current });
        });
      }
    },
    [],
  );

  return (
    <div
      className="relative flex h-full min-h-0 flex-col overflow-y-auto px-6 py-6"
      onMouseMove={handleGridMouseMove}
    >
      <div
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          background: `radial-gradient(circle 24rem at ${mouse.x}% ${mouse.y}%, color-mix(in oklab, var(--accent-fill) 4%, transparent), transparent 54%)`,
        }}
      />
      <div className="relative z-10">{children}</div>
    </div>
  );
}
