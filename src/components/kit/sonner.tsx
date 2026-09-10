"use client"

import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      closeButton
      icons={{
        success: (
          <CircleCheckIcon className="size-3.5" />
        ),
        info: (
          <InfoIcon className="size-3.5" />
        ),
        warning: (
          <TriangleAlertIcon className="size-3.5" />
        ),
        error: (
          <OctagonXIcon className="size-3.5" />
        ),
        loading: (
          <Loader2Icon className="size-3.5 animate-spin" />
        ),
      }}
      style={
        {
          "--normal-bg": "var(--mat-floating)",
          "--normal-text": "var(--color-zinc-200)",
          "--normal-border": "var(--edge)",
          "--border-radius": "var(--r-panel)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast foleyard-toast",
          closeButton: "hidden sm:flex",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
