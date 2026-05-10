import * as React from "react"

import { cn } from "@/lib/utils"

function Alert({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<"div"> & { variant?: "default" | "destructive" }) {
  return (
    <div
      data-slot="alert"
      data-variant={variant}
      className={cn(
        "flex flex-col gap-1 rounded-xl border px-4 py-3 text-sm",
        variant === "default"
          ? "border-border/40 bg-muted/30 text-foreground"
          : "border-destructive/20 bg-destructive/10 text-destructive",
        className
      )}
      {...props}
    />
  )
}

function AlertTitle({ className, ...props }: React.ComponentProps<"h5">) {
  return (
    <h5
      data-slot="alert-title"
      className={cn("font-medium leading-snug tracking-tight", className)}
      {...props}
    />
  )
}

function AlertDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-description"
      className={cn("text-sm leading-relaxed text-muted-foreground [&_strong]:font-medium [&_strong]:text-foreground", className)}
      {...props}
    />
  )
}

export { Alert, AlertTitle, AlertDescription }
