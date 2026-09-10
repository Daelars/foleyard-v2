"use client"

import { useLayoutEffect, useState } from "react"
import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react"

// The app-v3 prototype route renders its own I-styled Toaster and marks
// <body data-variant-i-toasts>; while that marker is present this global
// toaster stands down so every toast renders exactly once. The original
// `/` route never sets the marker, so its presentation is unchanged.
// useLayoutEffect (not useEffect) is deliberate: layout effects run before
// the child route's passive effect sets the marker, so the observer never
// misses the initial mutation.
function isAppV3ToastsActive() {
  if (typeof document === "undefined") return false;
  return document.body.hasAttribute("data-variant-i-toasts");
}

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()
  const [suppressed, setSuppressed] = useState(() =>
    isAppV3ToastsActive(),
  )

  useLayoutEffect(() => {
    const observer = new MutationObserver(() =>
      setSuppressed(isAppV3ToastsActive()),
    );
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ["data-variant-i-toasts"],
    });
    return () => observer.disconnect();
  }, []);

  if (suppressed) {
    return null;
  }

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      closeButton
      icons={{
        success: (
          <CircleCheckIcon className="size-4" />
        ),
        info: (
          <InfoIcon className="size-4" />
        ),
        warning: (
          <TriangleAlertIcon className="size-4" />
        ),
        error: (
          <OctagonXIcon className="size-4" />
        ),
        loading: (
          <Loader2Icon className="size-4 animate-spin" />
        ),
      }}
      style={
        {
          "--normal-bg": "var(--shell)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "rgba(255,255,255,0.1)",
          "--border-radius": "var(--radius-xl)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast",
          closeButton: "hidden sm:flex",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
