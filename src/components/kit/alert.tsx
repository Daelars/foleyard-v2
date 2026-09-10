import * as React from "react"

import { cn } from "@/lib/utils"

// Variant I's alert: a tinted panel, not a bordered box with a coloured rule.
// The tone owns the fill and the edge, and the title tells you which kind it
// is by its letterform as much as its colour — a warning is set in mono small
// caps, an error in sentence case behind an accent dot. Body copy stays
// neutral at every tone so a long message never becomes a wall of colour.

const ALERT_TONE = {
  default: "border-edge bg-white/[0.03]",
  info: "border-sky-300/25 bg-sky-300/[0.05]",
  success: "border-emerald-300/25 bg-emerald-300/[0.05]",
  warning: "border-amber-300/25 bg-amber-300/[0.05]",
  destructive:
    "border-edge-accent-soft bg-[color-mix(in_oklab,var(--accent-fill)_8%,transparent)]",
} as const

function Alert({
  className,
  variant = "default",
  children,
  ...props
}: React.ComponentProps<"div"> & { variant?: keyof typeof ALERT_TONE }) {
  return (
    <div
      data-slot="alert"
      data-variant={variant}
      role="alert"
      className={cn(
        "flex flex-col gap-1 rounded-lg border px-3.5 py-3 text-[13px] text-zinc-300",
        ALERT_TONE[variant] ?? ALERT_TONE.default,
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}

function AlertTitle({ className, children, ...props }: React.ComponentProps<"h5">) {
  return (
    <h5
      data-slot="alert-title"
      className={cn(
        "flex items-center gap-2 text-[13px] leading-snug font-medium text-zinc-100",
        // Warning speaks in mono small caps, the way the kit sets it.
        "in-data-[variant=warning]:font-mono in-data-[variant=warning]:text-[10px]",
        "in-data-[variant=warning]:uppercase in-data-[variant=warning]:leading-relaxed",
        "in-data-[variant=warning]:tracking-[0.08em] in-data-[variant=warning]:text-amber-200/90",
        "in-data-[variant=success]:text-emerald-200 in-data-[variant=info]:text-sky-200",
        className
      )}
      {...props}
    >
      <span
        aria-hidden
        className="hidden size-2.5 shrink-0 rounded-full bg-accent-fill in-data-[variant=destructive]:block"
      />
      {children}
    </h5>
  )
}

function AlertDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-description"
      className={cn(
        "text-xs leading-relaxed text-zinc-400 [&_strong]:font-medium [&_strong]:text-zinc-100",
        className
      )}
      {...props}
    />
  )
}

export { Alert, AlertTitle, AlertDescription }
