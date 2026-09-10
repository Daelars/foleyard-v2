"use client";

// app-v3 adapter for DesktopTitleBar: identical desktop-bridge behavior
// (drag region, minimize/maximize/close), I-styled window buttons.
import { Minus, Square, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { CSSProperties } from "react";

import { getDesktopBridge, useDesktopApp } from "@/lib/desktop";

function TitleBarButton({
  ariaLabel,
  children,
  danger = false,
  onClick,
}: {
  ariaLabel: string;
  children: React.ReactNode;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={onClick}
      style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
      className={
        danger
          ? "flex h-10 w-12 items-center justify-center text-zinc-400 outline-none transition-[background-color,color] hover:bg-[color-mix(in_oklab,var(--accent-fill)_18%,transparent)] hover:text-accent-text focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--vi-focus)]"
          : "flex h-10 w-12 items-center justify-center text-zinc-400 outline-none transition-[background-color,color] hover:bg-white/[0.05] hover:text-zinc-100 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--vi-focus)]"
      }
    >
      {children}
    </button>
  );
}

export function V3DesktopTitleBar() {
  const [isMaximized, setIsMaximized] = useState(false);
  const desktop = useDesktopApp();

  useEffect(() => {
    if (!desktop) {
      return;
    }

    const bridge = getDesktopBridge();
    if (!bridge) {
      return;
    }

    void bridge.getWindowState().then((state) => {
      setIsMaximized(state.isMaximized);
    });

    return bridge.onWindowState((state) => {
      setIsMaximized(state.isMaximized);
    });
  }, [desktop]);

  if (!desktop) {
    return null;
  }

  const bridge = getDesktopBridge();
  if (!bridge) {
    return null;
  }

  return (
    <div
      style={{ WebkitAppRegion: "drag" } as CSSProperties}
      className="flex h-10 shrink-0 items-center border-b border-[var(--vi-edge)] pl-3"
    >
      <div className="flex-1" />

      <div className="flex items-stretch">
        <TitleBarButton
          ariaLabel="Minimize window"
          onClick={() => {
            void bridge.minimizeWindow();
          }}
        >
          <Minus className="size-4" />
        </TitleBarButton>
        <TitleBarButton
          ariaLabel={isMaximized ? "Restore window" : "Maximize window"}
          onClick={() => {
            void bridge.toggleMaximizeWindow();
          }}
        >
          <Square className="size-3.5" />
        </TitleBarButton>
        <TitleBarButton
          ariaLabel="Close window"
          danger
          onClick={() => {
            void bridge.closeWindow();
          }}
        >
          <X className="size-4" />
        </TitleBarButton>
      </div>
    </div>
  );
}