"use client";

import { Minus, Square, X } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import type { CSSProperties, ReactNode } from "react";

import { getDesktopBridge, isDesktopApp } from "@/lib/desktop";

function TitleBarButton({
  ariaLabel,
  children,
  danger = false,
  onClick,
}: {
  ariaLabel: string;
  children: ReactNode;
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
          ? "flex h-10 w-12 items-center justify-center text-muted-foreground transition-[background-color,color] hover:bg-destructive hover:text-destructive-foreground focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          : "flex h-10 w-12 items-center justify-center text-muted-foreground transition-[background-color,color] hover:bg-accent/50 hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      }
    >
      {children}
    </button>
  );
}

export function DesktopTitleBar() {
  const [isMaximized, setIsMaximized] = useState(false);
  const desktop = useSyncExternalStore(
    () => () => undefined,
    isDesktopApp,
    () => false,
  );

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
      className="flex h-10 shrink-0 items-center border-b border-border/40 bg-card/60 pl-3 backdrop-blur-xl"
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
