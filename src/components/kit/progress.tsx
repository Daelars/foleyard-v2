"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

// New shared component, built to variant I. Scan progress, model downloads
// and pack builds each drew their own bar.
//
// An 8px trough at white/[0.07] with an inward shadow, and a solid accent
// fill that glows. The glow is the point: a running job is the one thing on
// the screen that is actively happening, and variant I lets it say so.
//
// `indeterminate` sweeps a band rather than guessing a value, and stops dead
// under reduced motion rather than animating a lie about progress.

function Progress({
  value,
  indeterminate = false,
  className,
  label,
  ...props
}: React.ComponentProps<"div"> & {
  value?: number
  indeterminate?: boolean
  label?: string
}) {
  const pct = Math.max(0, Math.min(100, value ?? 0))
  return (
    <div
      data-slot="progress"
      role="progressbar"
      aria-valuenow={indeterminate ? undefined : Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      className={cn(
        "relative h-2 w-full overflow-hidden rounded-full bg-white/[0.07] shadow-[inset_0_1px_2px_rgba(0,0,0,0.5)]",
        className
      )}
      {...props}
    >
      {indeterminate ? (
        <span
          aria-hidden
          className="absolute inset-y-0 left-0 w-1/3 rounded-full bg-accent-fill shadow-[0_0_12px_color-mix(in_oklab,var(--accent-fill)_40%,transparent)] motion-safe:animate-[progress-sweep_1.4s_ease-in-out_infinite]"
        />
      ) : (
        <span
          aria-hidden
          style={{ width: `${pct}%` }}
          className="absolute inset-y-0 left-0 rounded-full bg-accent-fill shadow-[0_0_12px_color-mix(in_oklab,var(--accent-fill)_40%,transparent)] transition-[width] duration-300 motion-reduce:transition-none"
        />
      )}
    </div>
  )
}

export { Progress }
